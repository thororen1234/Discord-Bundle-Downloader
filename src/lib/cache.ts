import { createClient, RESP_TYPES } from "redis";

import { Config } from "./config";
import { persistent } from "./global";

export const FULL_CACHE_BUILDS = 8;
const KEY_PREFIX = "discord-build-full:v1:";
const TTL_SECONDS = 24 * 60 * 60;

const inFlight = persistent("fullInFlight", () => new Map<string, Promise<Buffer<ArrayBuffer>>>());

function redis() {
    return persistent("redis", () => {
        if (!Config.redisUrl) {
            console.warn("[cache] REDIS_URL is not set, /full responses are not cached");
            return null;
        }
        const client = createClient({
            url: Config.redisUrl,
            disableOfflineQueue: true,
            socket: { reconnectStrategy: retries => Math.min(retries * 1000, 30_000) },
        }).withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer });
        client.on("error", (error: Error) => console.warn(`[cache] redis: ${error.message}`));
        client.connect().catch(() => { });
        return client;
    });
}

export function cachedFull(id: string, cache: boolean, build: () => Promise<Buffer<ArrayBuffer>>): Promise<Buffer<ArrayBuffer>> {
    let pending = inFlight.get(id);
    if (!pending) {
        pending = (async () => {
            const client = cache ? redis() : null;
            if (client?.isReady) {
                const hit = await client.get(KEY_PREFIX + id).catch((error: Error) => {
                    console.warn(`[cache] redis get ${id}: ${error.message}`);
                    return null;
                });
                if (hit) return hit as Buffer<ArrayBuffer>;
            }
            const data = await build();
            if (client?.isReady) {
                client.set(KEY_PREFIX + id, data, { expiration: { type: "EX", value: TTL_SECONDS } })
                    .catch((error: Error) => console.warn(`[cache] redis set ${id}: ${error.message}`));
            }
            return data;
        })().finally(() => inFlight.delete(id));
        inFlight.set(id, pending);
    }
    return pending;
}
