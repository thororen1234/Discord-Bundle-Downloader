import { APP_ORIGINS, Config } from "../config";
import type { Channel, FullBundle } from "../types";
import { loadLazyChunks } from "./chunks";
import { computeDepInfo } from "./deps";
import { parseAppHtml } from "./html";
import { loadMainChunk } from "./webpack";

export interface ScrapeProgress {
    stage: string;
    chunksDone: number;
    chunksTotal: number;
}

export interface ScrapeOptions {
    channel: Channel;
    buildHash: string;
    html?: string;
    onProgress?(progress: ScrapeProgress): void;
}

const MAX_FAILED_RATIO = 0.02;

async function fetchText(url: string): Promise<string> {
    const res = await fetch(url, { headers: { "User-Agent": Config.userAgent } });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    return res.text();
}

export async function scrapeFullBundle({ channel, buildHash, html, onProgress }: ScrapeOptions): Promise<FullBundle> {
    const origin = APP_ORIGINS[channel];
    const assetBase = `${origin}/assets/`;
    const report = (stage: string, chunksDone = 0, chunksTotal = 0) => onProgress?.({ stage, chunksDone, chunksTotal });
    const firstSeen = Date.now();

    report("Parsing app HTML");
    const { globalEnvText, webJsFile, initialChunkFiles } = parseAppHtml(html ?? await fetchText(`${origin}/app`));

    report("Fetching main chunk");
    const webJs = await fetchText(assetBase + webJsFile);

    report("Capturing webpack require");
    const main = loadMainChunk(webJs, globalEnvText, webJsFile);

    report("Loading lazy chunks");
    const lazy = await loadLazyChunks({
        assetBase,
        initialFiles: initialChunkFiles,
        initialChunkIds: main.chunkIds,
        chunkFile: main.chunkFile,
        concurrency: Config.chunkConcurrency,
        userAgent: Config.userAgent,
        onProgress: (done, total) => report("Loading lazy chunks", done, total),
    });

    const totalChunks = Object.keys(lazy.moduleSources).length + lazy.failed.length + lazy.skipped.length;
    if (lazy.failed.length > totalChunks * MAX_FAILED_RATIO) {
        throw new Error(`${lazy.failed.length}/${totalChunks} chunks failed to load`);
    }

    const modules = { ...main.modules, ...lazy.modules };
    const moduleSources = {
        [webJsFile]: Object.keys(main.modules).map(Number),
        ...lazy.moduleSources,
    };

    report("Resolving module dependencies");
    const depInfo = computeDepInfo(modules);

    console.log(
        `[scraper] ${channel} ${buildHash}: ${Object.keys(modules).length} modules from ${Object.keys(moduleSources).length} chunks`
        + ` (${lazy.skipped.length} skipped, ${lazy.failed.length} failed)`
    );

    return {
        metadata: {
            buildHash,
            buildNumber: main.buildNumber,
            firstSeen,
            entryPoint: main.entryPoint,
            channels: [channel],
        },
        depInfo,
        moduleSources,
        modules,
        envVarText: globalEnvText,
    };
}
