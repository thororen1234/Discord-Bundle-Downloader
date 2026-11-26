import { promisify } from "util";
import zlib from "zlib";

import { hasAndroidData, parseAndroidBuildId, readAndroidDataRaw } from "@/lib/android/storage";
import { cachedFull, FULL_CACHE_BUILDS } from "@/lib/cache";
import { bufferResponse, downloadName, textResponse, ZSTD_MIME_TYPE } from "@/lib/http";
import { getAndroidBuilds, getIndex } from "@/lib/services";
import { hasBundle, isValidBuildHash, readBundleRaw } from "@/lib/storage";

const zstdCompress = promisify(zlib.zstdCompress);

export async function GET(_request: Request, { params }: RouteContext<"/build/[hash]/full">) {
    const { hash } = await params;
    const versionCode = parseAndroidBuildId(hash);
    if (versionCode != null) return androidFull(hash, versionCode);
    if (!isValidBuildHash(hash)) return textResponse(400, "invalid build hash");

    const index = await getIndex();
    const meta = index.get(hash);
    if (!meta || !await hasBundle(hash)) return textResponse(404, `build ${hash} not found`);
    const newest = index.list().slice(-FULL_CACHE_BUILDS).some(m => m.buildHash === hash);
    const data = await cachedFull(hash, newest, async () => zstdCompress(await readBundleRaw(hash)));
    return bufferResponse(data, ZSTD_MIME_TYPE, downloadName(meta, ".data.mpk.zst"));
}

async function androidFull(id: string, versionCode: number) {
    const builds = await getAndroidBuilds();
    const build = builds.find(b => b.versionCode === versionCode);
    if (!build?.modules || !await hasAndroidData(versionCode)) return textResponse(404, `android build ${versionCode} not found`);
    const newest = builds.map(b => b.versionCode).sort((a, b) => b - a).slice(0, FULL_CACHE_BUILDS).includes(versionCode);
    const data = await cachedFull(id, newest, async () => zstdCompress(await readAndroidDataRaw(versionCode)));
    return bufferResponse(data, ZSTD_MIME_TYPE, `discord-android-${versionCode}.data.mpk.zst`);
}
