import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { ANDROID_BUNDLE_FILE_NAME, androidBuildPath, readAndroidBuilds } from "./android/storage";
import { Config } from "./config";
import { formatBytes } from "./format";
import { buildPath, buildsRoot, DATA_FILE_NAME, isValidBuildHash, readMetadata, writeAtomic } from "./storage";

const COMPACTED_FILE_NAME = "compacted";
const ZSTD_LEVEL = 22;

const zstdCompress = promisify(zlib.zstdCompress);
const zstdDecompress = promisify(zlib.zstdDecompress);

async function compactFile(file: string): Promise<void> {
    const marker = path.join(path.dirname(file), COMPACTED_FILE_NAME);
    const [before, done] = await Promise.all([fs.stat(file).catch(() => null), fs.stat(marker).catch(() => null)]);
    if (!before || (done && done.mtimeMs >= before.mtimeMs)) return;

    const raw = await zstdDecompress(await fs.readFile(file));
    const compressed = await zstdCompress(raw, {
        params: { [zlib.constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL },
    });
    if (!(await zstdDecompress(compressed)).equals(raw)) throw new Error(`${file} changed after recompression`);

    if (compressed.length < before.size) {
        const now = await fs.stat(file);
        if (now.mtimeMs !== before.mtimeMs || now.size !== before.size) return;
        await writeAtomic(file, compressed);
    }
    await fs.writeFile(marker, "");
    console.log(`[compact] ${file}: ${formatBytes(before.size)} -> ${formatBytes(Math.min(compressed.length, before.size))}`);
}

async function oldBuildFiles(cutoff: number): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await fs.readdir(buildsRoot(), { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory() || !isValidBuildHash(entry.name)) continue;
        const meta = await readMetadata(entry.name).catch(() => null);
        if (meta && meta.firstSeen < cutoff) files.push(path.join(buildPath(entry.name), DATA_FILE_NAME));
    }
    for (const build of await readAndroidBuilds()) {
        if (build.firstSeen < cutoff) files.push(path.join(androidBuildPath(build.versionCode), ANDROID_BUNDLE_FILE_NAME));
    }
    return files;
}

export async function compactOldBuilds(): Promise<void> {
    for (const file of await oldBuildFiles(Date.now() - Config.compactAfterMs)) {
        await compactFile(file).catch(e => console.error(`[compact] failed to compact ${file}:`, e));
    }
}
