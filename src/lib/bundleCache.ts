import { Config } from "./config";
import { readFullBundle } from "./storage";
import type { FullBundle } from "./types";

const g = globalThis as typeof globalThis & { __bundleCache?: Map<string, Promise<FullBundle>>; };
const cache = g.__bundleCache ??= new Map();

export function getFullBundle(buildHash: string): Promise<FullBundle> {
    let bundle = cache.get(buildHash);
    if (bundle) {
        cache.delete(buildHash);
    } else {
        bundle = readFullBundle(buildHash);
        bundle.catch(() => cache.delete(buildHash));
    }
    cache.set(buildHash, bundle);

    while (cache.size > Config.bundleCacheSize) {
        cache.delete(cache.keys().next().value!);
    }
    return bundle;
}
