import { promisify } from "util";
import zlib from "zlib";

import { hasAndroidData, parseAndroidBuildId, readAndroidDataRaw } from "@/lib/android/storage";
import { bufferResponse, downloadName, textResponse, ZSTD_MIME_TYPE } from "@/lib/http";
import { getAndroidBuilds, getIndex } from "@/lib/services";
import { hasBundle, isValidBuildHash, readBundleRaw } from "@/lib/storage";

const zstdCompress = promisify(zlib.zstdCompress);

export async function GET(_request: Request, { params }: RouteContext<"/build/[hash]/full">) {
    const { hash } = await params;
    const versionCode = parseAndroidBuildId(hash);
    if (versionCode != null) return androidFull(versionCode);
    if (!isValidBuildHash(hash)) return textResponse(400, "invalid build hash");

    const meta = (await getIndex()).get(hash);
    if (!meta || !await hasBundle(hash)) return textResponse(404, `build ${hash} not found`);
    return bufferResponse(await zstdCompress(await readBundleRaw(hash)), ZSTD_MIME_TYPE, downloadName(meta, ".data.mpk.zst"));
}

async function androidFull(versionCode: number) {
    const build = (await getAndroidBuilds()).find(b => b.versionCode === versionCode);
    if (!build?.modules || !await hasAndroidData(versionCode)) return textResponse(404, `android build ${versionCode} not found`);
    return bufferResponse(await zstdCompress(await readAndroidDataRaw(versionCode)), ZSTD_MIME_TYPE, `discord-android-${versionCode}.data.mpk.zst`);
}
