import { fetchText } from "./chunks";

export interface CssLoaderOptions {
    assetBase: string;
    files: string[];
    concurrency: number;
    userAgent: string;
    onProgress?(done: number, total: number): void;
}

export async function loadCssChunks(options: CssLoaderOptions): Promise<Record<string, string>> {
    const queue = [...new Set(options.files)];
    const total = queue.length;
    const loaded: [string, string][] = [];
    const failed: string[] = [];

    await Promise.all(Array.from({ length: options.concurrency }, async () => {
        for (let file = queue.shift(); file != null; file = queue.shift()) {
            try {
                const css = await fetchText(options.assetBase + file, options.userAgent);
                if (css == null) failed.push(file);
                else loaded.push([file, css]);
            } catch (error) {
                console.warn(`[scraper] failed to load css chunk ${file}:`, error);
                failed.push(file);
            }
            options.onProgress?.(loaded.length + failed.length, total);
        }
    }));

    if (failed.length) console.warn(`[scraper] ${failed.length}/${total} css chunks failed to load: ${failed.join(", ")}`);

    return Object.fromEntries(loaded.sort(([a], [b]) => a < b ? -1 : 1));
}
