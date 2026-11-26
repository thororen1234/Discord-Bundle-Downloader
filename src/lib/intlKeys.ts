import fs from "fs/promises";
import path from "path";

import { Config } from "./config";
import { persistent } from "./global";
import { writeAtomic } from "./storage";

const SEED_FILE = path.join(process.cwd(), "public", "assets", "intl", "key-mappings.json");
const KEYS_FILE = path.join(Config.dataDir, "intl", "key-mappings.json");

const state = persistent("intlKeys", () => ({ keys: null as Promise<Record<string, string>> | null }));

export function getIntlKeys(): Promise<Record<string, string>> {
    state.keys ??= (async () => {
        const raw = await fs.readFile(KEYS_FILE, "utf8").catch(error => {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            return null;
        });
        const keys: Record<string, string> = Object.assign(Object.create(null), raw && JSON.parse(raw));
        const seed: Record<string, string> = JSON.parse(await fs.readFile(SEED_FILE, "utf8").catch(() => "{}"));
        let added = 0;
        for (const [hash, name] of Object.entries(seed)) {
            if (Object.hasOwn(keys, hash)) continue;
            keys[hash] = name;
            added++;
        }
        if (raw == null || added) {
            await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });
            await writeAtomic(KEYS_FILE, Buffer.from(JSON.stringify(keys, null, 2)));
        }
        return keys;
    })().catch(error => {
        state.keys = null;
        throw error;
    });
    return state.keys;
}

export async function syncIntlKeys(): Promise<void> {
    const url = Config.intlKeysUrl;
    if (!url) return;
    let remote: unknown;
    try {
        const response = await fetch(url, { headers: { "User-Agent": Config.userAgent }, signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        remote = await response.json();
    } catch (error) {
        console.warn(`[intl] failed to fetch keys from ${url}: ${(error as Error).message}`);
        return;
    }
    if (remote == null || typeof remote !== "object" || Array.isArray(remote)) {
        console.warn(`[intl] keys from ${url} are not a JSON object`);
        return;
    }

    const keys: Record<string, string> = Object.assign(Object.create(null), await getIntlKeys());
    let added = 0;
    for (const [hash, name] of Object.entries(remote)) {
        if (typeof name !== "string" || Object.hasOwn(keys, hash)) continue;
        keys[hash] = name;
        added++;
    }
    if (!added) return;
    await writeAtomic(KEYS_FILE, Buffer.from(JSON.stringify(keys, null, 2)));
    state.keys = Promise.resolve(keys);
    console.log(`[intl] added ${added} keys from ${url}`);
}
