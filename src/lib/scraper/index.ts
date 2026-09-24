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
    const response = await fetch(url, { headers: { "User-Agent": Config.userAgent } });
    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
    return response.text();
}

export async function scrapeFullBundle({ channel, buildHash, html, onProgress }: ScrapeOptions): Promise<FullBundle> {
    const origin = APP_ORIGINS[channel];
    const assetBase = `${origin}/assets/`;
    const progress = (stage: string, chunksDone = 0, chunksTotal = 0) => onProgress?.({ stage, chunksDone, chunksTotal });
    const firstSeen = Date.now();

    progress("Parsing app HTML");
    const { globalEnvText, webJsFile, initialChunkFiles } = parseAppHtml(html ?? await fetchText(`${origin}/app`));

    progress("Fetching main chunk");
    const webJs = await fetchText(assetBase + webJsFile);

    progress("Capturing webpack require");
    const mainChunk = loadMainChunk(webJs, globalEnvText, webJsFile);

    progress("Loading lazy chunks");
    const lazyChunks = await loadLazyChunks({
        assetBase,
        initialFiles: initialChunkFiles,
        initialChunkIds: mainChunk.chunkIds,
        chunkFile: mainChunk.chunkFile,
        concurrency: Config.chunkConcurrency,
        userAgent: Config.userAgent,
        onProgress: (done, total) => progress("Loading lazy chunks", done, total),
    });

    const totalChunks = Object.keys(lazyChunks.moduleSources).length + lazyChunks.failed.length + lazyChunks.skipped.length;
    if (lazyChunks.failed.length > totalChunks * MAX_FAILED_RATIO) {
        throw new Error(`${lazyChunks.failed.length}/${totalChunks} chunks failed to load`);
    }

    const modules = { ...mainChunk.modules, ...lazyChunks.modules };
    const moduleSources = {
        [webJsFile]: Object.keys(mainChunk.modules).map(Number),
        ...lazyChunks.moduleSources,
    };

    progress("Resolving module dependencies");
    const depInfo = computeDepInfo(modules);

    console.log(
        `[scraper] ${channel} ${buildHash}: ${Object.keys(modules).length} modules from ${Object.keys(moduleSources).length} chunks`
        + ` (${lazyChunks.skipped.length} skipped, ${lazyChunks.failed.length} failed)`
    );

    return {
        metadata: {
            buildHash,
            buildNumber: mainChunk.buildNumber,
            firstSeen,
            entryPoint: mainChunk.entryPoint,
            channels: [channel],
        },
        depInfo,
        moduleSources,
        modules,
        envVarText: globalEnvText,
    };
}
