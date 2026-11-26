import path from "path";

import { parseAndroidBuildId } from "./android/storage";
import { persistent } from "./global";
import { textResponse } from "./http";
import { findIntl, type IntlMessage, type IntlMessages } from "./scraper/intl";
import { getIndex } from "./services";
import { buildPath, exists, hasBundle, isValidBuildHash, readFullBundle, readMpkZst, writeMpkZst } from "./storage";
import type { FullBundle } from "./types";

export const INTL_FILE_NAME = "intl.mpk.zst";
const INTL_ZSTD_LEVEL = 10;

const inFlight = persistent("intlInFlight", () => new Map<string, Promise<void>>());

export function writeIntl(buildHash: string, bundle?: FullBundle): Promise<void> {
    let pending = inFlight.get(buildHash);
    if (!pending) {
        pending = (async () => {
            const start = performance.now();
            const modules = (bundle ?? await readFullBundle(buildHash)).modules;
            let intl: IntlMessages;
            try {
                intl = findIntl(modules);
            } catch (error) {
                console.warn(`[intl] failed to collect intl messages for ${buildHash}: ${(error as Error).message}`);
                intl = { modules: [], messages: {} };
            }
            await writeMpkZst(path.join(buildPath(buildHash), INTL_FILE_NAME), intl, INTL_ZSTD_LEVEL);
            const seconds = ((performance.now() - start) / 1000).toFixed(1);
            console.log(`[intl] wrote ${Object.keys(intl.messages).length} messages for ${buildHash} in ${seconds}s`);
        })().finally(() => inFlight.delete(buildHash));
        inFlight.set(buildHash, pending);
    }
    return pending;
}

export async function intlFile(buildHash: string): Promise<string | null> {
    const file = path.join(buildPath(buildHash), INTL_FILE_NAME);
    if (await exists(file)) return file;
    if (!inFlight.has(buildHash) && !await hasBundle(buildHash)) return null;
    await writeIntl(buildHash);
    return file;
}

export async function resolveBuildHash(id: string): Promise<string | Response> {
    if (parseAndroidBuildId(id) != null) return textResponse(404, `intl messages for build ${id} not found`);
    const channel = { "latest": undefined, "latest-stable": "stable", "latest-canary": "canary" } as const;
    if (!Object.hasOwn(channel, id)) return isValidBuildHash(id) ? id : textResponse(400, "invalid build hash");
    const meta = (await getIndex()).latest(channel[id as keyof typeof channel]);
    return meta?.buildHash ?? textResponse(404, `no build matches ${id}`);
}

export async function findIntlMessage(request: Request, id: string): Promise<IntlMessage | Response> {
    const hash = await resolveBuildHash(id);
    if (hash instanceof Response) return hash;
    const key = new URL(request.url).searchParams.get("key");
    if (key == null) return textResponse(400, "Failed to deserialize query string: missing field `key`");

    const file = await intlFile(hash);
    if (!file) return textResponse(404, `intl messages for build ${hash} not found`);
    const { messages } = await readMpkZst<IntlMessages>(file);
    return Object.hasOwn(messages, key) ? messages[key] : textResponse(404, `intl key ${key} not found in build ${hash}`);
}
