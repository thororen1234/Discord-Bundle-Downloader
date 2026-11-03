import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { pipeline, Readable } from "stream";
import zlib from "zlib";

import { ANDROID_BUNDLE_FILE_NAME, androidBuildPath, isValidVersionCode } from "@/lib/android/storage";
import { acceptsZstd, attachment, textResponse } from "@/lib/http";
import { getAndroidBuilds } from "@/lib/services";
import { exists } from "@/lib/storage";

export async function GET(request: Request, { params }: RouteContext<"/android/[versionCode]/bundle">) {
    const { versionCode } = await params;
    if (!isValidVersionCode(versionCode)) return textResponse(400, "invalid version code");

    const build = (await getAndroidBuilds()).find(b => b.versionCode === Number(versionCode));
    const file = path.join(androidBuildPath(Number(versionCode)), ANDROID_BUNDLE_FILE_NAME);
    if (!build || !await exists(file)) return textResponse(404, `android build ${versionCode} not found`);

    const headers = {
        "Content-Type": "application/octet-stream",
        "Vary": "Accept-Encoding",
        ...attachment(`discord-android-${build.versionCode}.bundle`),
    };
    if (acceptsZstd(request)) {
        const { size } = await fs.stat(file);
        return new Response(Readable.toWeb(createReadStream(file, { highWaterMark: 1024 * 1024 })) as ReadableStream, {
            headers: { ...headers, "Content-Encoding": "zstd", "Content-Length": String(size) },
        });
    }

    const stream = pipeline(createReadStream(file), zlib.createZstdDecompress(), () => { });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: { ...headers, "Content-Length": String(build.bundleSize) },
    });
}
