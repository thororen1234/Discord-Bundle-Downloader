import { bufferResponse, textResponse } from "@/lib/http";
import { intlFile, resolveBuildHash } from "@/lib/intl";
import { getIntlKeys } from "@/lib/intlKeys";
import type { IntlMessages } from "@/lib/scraper/intl";
import { readMpkZst } from "@/lib/storage";

export async function GET(request: Request, { params }: RouteContext<"/build/[hash]/intl/diff">) {
    const hash = await resolveBuildHash((await params).hash);
    if (hash instanceof Response) return hash;
    const against = new URL(request.url).searchParams.get("against");
    const otherHash = against == null ? null : await resolveBuildHash(against);
    if (otherHash instanceof Response) return otherHash;

    const files: string[] = [];
    for (const target of otherHash == null ? [hash] : [hash, otherHash]) {
        const file = await intlFile(target);
        if (!file) return textResponse(404, `intl messages for build ${target} not found`);
        files.push(file);
    }
    const [{ messages }, other] = await Promise.all(files.map(file => readMpkZst<IntlMessages>(file)));
    const keys = await getIntlKeys();

    const hashes = Object.keys(messages).sort();
    const found: Record<string, string> = {};
    const missing: string[] = [];
    for (const key of hashes) {
        if (Object.hasOwn(keys, key)) found[key] = keys[key];
        else missing.push(key);
    }
    const stale = Object.keys(keys).filter(key => !Object.hasOwn(messages, key)).sort();
    const named = (list: string[]) => Object.fromEntries(list.map(key => [key, Object.hasOwn(keys, key) ? keys[key] : null]));

    return bufferResponse(Buffer.from(JSON.stringify({
        found,
        missing,
        stale,
        counts: { found: hashes.length - missing.length, missing: missing.length, stale: stale.length },
        ...other && {
            added: named(hashes.filter(key => !Object.hasOwn(other.messages, key))),
            removed: named(Object.keys(other.messages).sort().filter(key => !Object.hasOwn(messages, key))),
        },
    })), "application/json");
}
