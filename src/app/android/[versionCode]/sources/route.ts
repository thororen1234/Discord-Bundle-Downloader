import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { pipeline, Readable } from "stream";
import zlib from "zlib";

import { ANDROID_SOURCES_FILE_NAME, androidBuildPath, isValidVersionCode } from "@/lib/android/storage";
import { acceptsZstd, textResponse } from "@/lib/http";
import { getAndroidBuilds } from "@/lib/services";
import { exists } from "@/lib/storage";

// jadx output of a Kotlin build, see writeAndroidSources. Browsers without zstd get it re-encoded as gzip
export async function GET(request: Request, { params }: RouteContext<"/android/[versionCode]/sources">) {
    const { versionCode } = await params;
    if (!isValidVersionCode(versionCode)) return textResponse(400, "invalid version code");

    const build = (await getAndroidBuilds()).find(b => b.versionCode === Number(versionCode));
    const file = path.join(androidBuildPath(Number(versionCode)), ANDROID_SOURCES_FILE_NAME);
    if (!build?.sources || !await exists(file)) return textResponse(404, `android build ${versionCode} has no sources`);

    const headers = { "Content-Type": "text/plain; charset=utf-8", "Vary": "Accept-Encoding" };
    if (acceptsZstd(request)) {
        const { size } = await fs.stat(file);
        return new Response(Readable.toWeb(createReadStream(file, { highWaterMark: 1024 * 1024 })) as ReadableStream, {
            headers: { ...headers, "Content-Encoding": "zstd", "Content-Length": String(size) },
        });
    }

    const stream = pipeline(createReadStream(file), zlib.createZstdDecompress(), zlib.createGzip(), () => { });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: { ...headers, "Content-Encoding": "gzip" },
    });
}
