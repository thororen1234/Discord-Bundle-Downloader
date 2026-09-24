import { Config } from "./config";
import { persistent } from "./global";
import { readFullBundle } from "./storage";
import type { FullBundle } from "./types";

const cache = persistent("bundleCache", () => new Map<string, Promise<FullBundle>>());

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
