import { WebpackLazyChunkParser } from "@vencord-companion/webpack-chunk-parser";

import { CHUNK_LOAD_RE } from "./webpack";

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

const CHUNK_GLOBAL = "webpackChunkdiscord_app";
const RETRIES = 3;

async function fetchText(url: string, userAgent: string): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(url, { headers: { "User-Agent": userAgent } });
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return await response.text();
        } catch (error) {
            if (attempt >= RETRIES) throw error;
            await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
        }
    }
}

export async function loadLazyChunks(options: ChunkLoaderOptions): Promise<LoadedChunks> {
    const loaded: LoadedChunks = { modules: {}, moduleSources: {}, failed: [], skipped: [] };

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
        const file = options.chunkFile(id);
        if (file) enqueueFile(file);
    };

    options.initialFiles.forEach(enqueueFile);
    options.initialChunkIds.forEach(enqueueId);

    const parseChunk = (file: string, code: string) => {
        let modules: Record<string, string> | undefined;
        if (code.includes(CHUNK_GLOBAL)) {
            try {
                modules = new WebpackLazyChunkParser(code).getDefinedModules();
            } catch (error) {
                console.warn(`[scraper] failed to parse chunk ${file}:`, error);
            }
        }
        if (!modules || !Object.keys(modules).length) {
            loaded.skipped.push(file);
            return;
        }

        const ids: number[] = [];
        for (const [id, src] of Object.entries(modules)) {
            loaded.modules[id] = src;
            ids.push(Number(id));
            for (const [, chunkId] of src.matchAll(CHUNK_LOAD_RE)) enqueueId(chunkId);
        }
        loaded.moduleSources[file] = ids;
    };

    const loadQueuedChunks = async () => {
        for (let file = queue.shift(); file != null; file = queue.shift()) {
            try {
                const code = await fetchText(options.assetBase + file, options.userAgent);
                if (code == null) loaded.failed.push(file);
                else parseChunk(file, code);
            } catch (error) {
                console.warn(`[scraper] failed to load chunk ${file}:`, error);
                loaded.failed.push(file);
            }
            options.onProgress?.(++done, seenFiles.size);
        }
    };

    while (queue.length) {
        await Promise.all(Array.from({ length: options.concurrency }, loadQueuedChunks));
    }

    return loaded;
}
