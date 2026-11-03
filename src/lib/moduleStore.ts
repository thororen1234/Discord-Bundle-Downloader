import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { Config } from "./config";
import { persistent } from "./global";
import { pack, unpack } from "./msgpack";
import { buildPath, buildsRoot, readFullBundle, writeAtomic } from "./storage";
import type { FullBundle, ModuleDeps } from "./types";

export const MODULE_INDEX_FILE_NAME = "modules.idx.mpk.zst";
export const MODULE_BLOCKS_FILE_NAME = "modules.bin";

const STORE_VERSION = 1;
const BLOCK_SIZE = 1024 * 1024;
const ZSTD_LEVEL = 10;
const CONCURRENCY = 4;
const CACHE_SIZE = 4;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

const zstdCompress = promisify(zlib.zstdCompress);
const zstdDecompress = promisify(zlib.zstdDecompress);

interface Block {
    offset: number;
    length: number;
    modules: [id: string, start: number, end: number][];
}

interface StoredIndex {
    version: number;
    envVarText: string;
    moduleSources: Record<string, number[]>;
    moduleDeps: Record<string, ModuleDeps>;
    blocks: Block[];
}

export interface SearchResult {
    id: string;
    before: string;
    after: string;
}

const stores = persistent("moduleStores", () => new Map<string, Promise<ModuleStore>>());
const touchedAt = persistent("moduleStoresTouchedAt", () => new Map<string, number>());

async function pool<T>(items: T[], run: (item: T, i: number) => Promise<void>): Promise<void> {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
        for (let i = next++; i < items.length; i = next++) await run(items[i], i);
    }));
}

async function readBlock(handle: fs.FileHandle, block: Block): Promise<Buffer> {
    const compressed = Buffer.allocUnsafe(block.length);
    await handle.read(compressed, 0, block.length, block.offset);
    return zstdDecompress(compressed);
}

export class ModuleStore {
    readonly moduleCount: number;
    readonly chunkCount: number;
    private readonly locations = new Map<string, [block: Block, start: number, end: number]>();

    constructor(private readonly blocksFile: string, private readonly index: StoredIndex) {
        for (const block of index.blocks) {
            for (const [id, start, end] of block.modules) this.locations.set(id, [block, start, end]);
        }
        this.moduleCount = this.locations.size;
        this.chunkCount = Object.keys(index.moduleSources).length;
    }

    get envVarText() {
        return this.index.envVarText;
    }

    has(id: string | number): boolean {
        return this.locations.has(String(id));
    }

    async read(id: string): Promise<string | null> {
        const location = this.locations.get(id);
        if (!location) return null;
        const [block, start, end] = location;
        const handle = await fs.open(this.blocksFile);
        try {
            return (await readBlock(handle, block)).toString("utf8", start, end);
        } finally {
            await handle.close();
        }
    }

    incomingDeps(id: string): ModuleDeps {
        return this.index.moduleDeps[id] ?? { sync: [], lazy: [] };
    }

    chunksOf(id: string): string[] {
        const n = Number(id);
        return Object.entries(this.index.moduleSources)
            .filter(([, ids]) => ids.includes(n))
            .map(([file]) => file);
    }

    async search(query: string, limit: number, radius: number): Promise<{ total: number; results: SearchResult[]; }> {
        const needle = Buffer.from(query);
        const perBlock: SearchResult[][] = [];
        const handle = await fs.open(this.blocksFile);
        try {
            await pool(this.index.blocks, async (block, i) => {
                const data = await readBlock(handle, block);
                const hits: SearchResult[] = [];
                for (const [id, start, end] of block.modules) {
                    const at = data.subarray(start, end).indexOf(needle);
                    if (at === -1) continue;
                    const from = start + at;
                    const to = from + needle.length;
                    hits.push({
                        id,
                        before: data.toString("utf8", Math.max(start, from - radius * 4), from).slice(-radius),
                        after: data.toString("utf8", to, Math.min(end, to + radius * 4)).slice(0, radius),
                    });
                }
                perBlock[i] = hits;
            });
        } finally {
            await handle.close();
        }
        const all = perBlock.flat();
        return { total: all.length, results: all.slice(0, limit) };
    }
}

export async function writeModuleStore(bundle: FullBundle): Promise<void> {
    const dir = buildPath(bundle.metadata.buildHash);
    await fs.mkdir(dir, { recursive: true });

    const groups: string[][] = [[]];
    let size = 0;
    for (const [id, code] of Object.entries(bundle.modules)) {
        const bytes = Buffer.byteLength(code);
        if (size && size + bytes > BLOCK_SIZE) {
            groups.push([]);
            size = 0;
        }
        groups.at(-1)!.push(id);
        size += bytes;
    }

    const frames: Buffer[] = [];
    const blocks: Block[] = [];
    await pool(groups, async (ids, i) => {
        const modules: Block["modules"] = [];
        let end = 0;
        for (const id of ids) {
            const start = end;
            end += Buffer.byteLength(bundle.modules[id]);
            modules.push([id, start, end]);
        }
        frames[i] = await zstdCompress(Buffer.from(ids.map(id => bundle.modules[id]).join("")), {
            params: { [zlib.constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL },
        });
        blocks[i] = { offset: 0, length: frames[i].length, modules };
    });

    let offset = 0;
    for (const block of blocks) {
        block.offset = offset;
        offset += block.length;
    }

    const index: StoredIndex = {
        version: STORE_VERSION,
        envVarText: bundle.envVarText,
        moduleSources: bundle.moduleSources,
        moduleDeps: bundle.depInfo.moduleDeps,
        blocks,
    };
    await writeAtomic(path.join(dir, MODULE_BLOCKS_FILE_NAME), Buffer.concat(frames));
    await writeAtomic(path.join(dir, MODULE_INDEX_FILE_NAME), zlib.zstdCompressSync(pack(index)));
}

async function readIndex(file: string): Promise<StoredIndex | null> {
    try {
        const index = unpack<StoredIndex>(await zstdDecompress(await fs.readFile(file)));
        return index.version === STORE_VERSION ? index : null;
    } catch {
        return null;
    }
}

async function loadModuleStore(buildHash: string): Promise<ModuleStore> {
    const dir = buildPath(buildHash);
    const indexFile = path.join(dir, MODULE_INDEX_FILE_NAME);
    let index = await readIndex(indexFile);
    if (!index) {
        const start = performance.now();
        await writeModuleStore(await readFullBundle(buildHash));
        console.log(`[modules] built store for ${buildHash} in ${((performance.now() - start) / 1000).toFixed(1)}s`);
        index = await readIndex(indexFile);
        if (!index) throw new Error(`module store for ${buildHash} is unreadable`);
    }
    return new ModuleStore(path.join(dir, MODULE_BLOCKS_FILE_NAME), index);
}

function touch(buildHash: string) {
    const now = Date.now();
    if (now - (touchedAt.get(buildHash) ?? 0) < TOUCH_INTERVAL_MS) return;
    touchedAt.set(buildHash, now);
    const time = new Date(now);
    void fs.utimes(path.join(buildPath(buildHash), MODULE_INDEX_FILE_NAME), time, time).catch(() => { });
}

export function getModuleStore(buildHash: string): Promise<ModuleStore> {
    let store = stores.get(buildHash);
    if (store) {
        stores.delete(buildHash);
    } else {
        store = loadModuleStore(buildHash);
        store.catch(() => stores.delete(buildHash));
    }
    stores.set(buildHash, store);
    touch(buildHash);

    while (stores.size > CACHE_SIZE) {
        stores.delete(stores.keys().next().value!);
    }
    return store;
}

async function removeStore(buildHash: string) {
    stores.delete(buildHash);
    touchedAt.delete(buildHash);
    await fs.rm(path.join(buildPath(buildHash), MODULE_INDEX_FILE_NAME), { force: true });
    await fs.rm(path.join(buildPath(buildHash), MODULE_BLOCKS_FILE_NAME), { force: true });
}

export async function sweepModuleStores(): Promise<void> {
    const cutoff = Date.now() - TTL_MS;
    const dirs = await fs.readdir(buildsRoot(), { withFileTypes: true });
    const kept: { buildHash: string; usedAt: number; size: number; }[] = [];
    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const stat = await fs.stat(path.join(buildsRoot(), dir.name, MODULE_INDEX_FILE_NAME)).catch(() => null);
        if (!stat) continue;
        if (stat.mtimeMs < cutoff) {
            await removeStore(dir.name);
            console.log(`[modules] expired store for ${dir.name}`);
            continue;
        }
        const blocks = await fs.stat(path.join(buildsRoot(), dir.name, MODULE_BLOCKS_FILE_NAME)).catch(() => null);
        kept.push({ buildHash: dir.name, usedAt: stat.mtimeMs, size: stat.size + (blocks?.size ?? 0) });
    }

    let total = kept.reduce((sum, store) => sum + store.size, 0);
    for (const store of kept.sort((a, b) => a.usedAt - b.usedAt)) {
        if (total <= Config.moduleCacheMaxBytes) break;
        if (stores.has(store.buildHash)) continue;
        await removeStore(store.buildHash);
        total -= store.size;
        console.log(`[modules] evicted store for ${store.buildHash}, cache is over ${Config.moduleCacheMaxBytes / 1024 ** 3} GB`);
    }
}
