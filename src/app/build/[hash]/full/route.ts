import path from "path";

import { ANDROID_DATA_FILE_NAME, androidBuildPath, parseAndroidBuildId } from "@/lib/android/storage";
import { downloadName, fileResponse, textResponse, ZSTD_MIME_TYPE } from "@/lib/http";
import { getAndroidBuilds, getIndex } from "@/lib/services";
import { buildPath, DATA_FILE_NAME, exists, isValidBuildHash } from "@/lib/storage";

export async function GET(_request: Request, { params }: RouteContext<"/build/[hash]/full">) {
    const { hash } = await params;
    const versionCode = parseAndroidBuildId(hash);
    if (versionCode != null) return androidFull(versionCode);
    if (!isValidBuildHash(hash)) return textResponse(400, "invalid build hash");

    const meta = (await getIndex()).get(hash);
    const file = path.join(buildPath(hash), DATA_FILE_NAME);
    if (!meta || !await exists(file)) return textResponse(404, `build ${hash} not found`);
    return fileResponse(file, ZSTD_MIME_TYPE, downloadName(meta, ".data.mpk.zst"));
}

async function androidFull(versionCode: number) {
    const build = (await getAndroidBuilds()).find(b => b.versionCode === versionCode);
    const file = path.join(androidBuildPath(versionCode), ANDROID_DATA_FILE_NAME);
    if (!build?.modules || !await exists(file)) return textResponse(404, `android build ${versionCode} not found`);
    return fileResponse(file, ZSTD_MIME_TYPE, `discord-android-${versionCode}.data.mpk.zst`);
}
