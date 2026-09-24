import vm from "vm";

import { CHUNK_LOAD_RE, factoryToString } from "./webpack";

export interface LoadedChunks {
    modules: Record<string, string>;
    moduleSources: Record<string, number[]>;
    failed: string[];
    skipped: string[];
}

export interface ChunkLoaderOptions {
    assetBase: string;
    initialFiles: string[];
    initialChunkIds: string[];
    chunkFile(chunkId: string): string | null;
    concurrency: number;
    userAgent: string;
    onProgress?(done: number, total: number): void;
}

type ChunkPush = [chunkIds: unknown[], modules: Record<string, unknown>, runtime?: unknown];

const CHUNK_GLOBAL = "webpackChunkdiscord_app";
const RETRIES = 3;

async function fetchText(url: string, userAgent: string): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch(url, { headers: { "User-Agent": userAgent } });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            return await res.text();
        } catch (e) {
            if (attempt >= RETRIES) throw e;
            await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
        }
    }
}

export async function loadLazyChunks(opts: ChunkLoaderOptions): Promise<LoadedChunks> {
    const result: LoadedChunks = { modules: {}, moduleSources: {}, failed: [], skipped: [] };

    const seenIds = new Set<string>();
    const seenFiles = new Set<string>();
    const queue: string[] = [];
    let done = 0;

    const enqueueFile = (file: string) => {
        if (seenFiles.has(file)) return;
        seenFiles.add(file);
        queue.push(file);
    };
    const enqueueId = (id: string) => {
        if (seenIds.has(id)) return;
        seenIds.add(id);
        const file = opts.chunkFile(id);
        if (file) enqueueFile(file);
    };

    opts.initialFiles.forEach(enqueueFile);
    opts.initialChunkIds.forEach(enqueueId);

    const ctx = vm.createContext({});
    ctx.self = ctx;
    ctx.window = ctx;

    const runChunk = (file: string, code: string) => {
        const pushed: ChunkPush[] = [];
        ctx[CHUNK_GLOBAL] = { push: (entry: ChunkPush) => void pushed.push(entry) };
        try {
            vm.runInContext(code, ctx, { filename: file, timeout: 10_000 });
        } catch { }
        if (!pushed.length) {
            result.skipped.push(file);
            return;
        }

        const ids: number[] = [];
        for (const [, modules] of pushed) {
            if (!modules || typeof modules !== "object") continue;
            for (const id in modules) {
                const src = factoryToString(modules[id]);
                result.modules[id] = src;
                ids.push(Number(id));
                for (const [, chunkId] of src.matchAll(CHUNK_LOAD_RE)) enqueueId(chunkId);
            }
        }
        result.moduleSources[file] = ids;
    };

    const worker = async () => {
        for (let file = queue.shift(); file != null; file = queue.shift()) {
            try {
                const code = await fetchText(opts.assetBase + file, opts.userAgent);
                if (code == null) result.failed.push(file);
                else runChunk(file, code);
            } catch (e) {
                console.warn(`[scraper] failed to load chunk ${file}:`, e);
                result.failed.push(file);
            }
            opts.onProgress?.(++done, seenFiles.size);
        }
    };

    while (queue.length) {
        await Promise.all(Array.from({ length: opts.concurrency }, worker));
    }

    return result;
}
