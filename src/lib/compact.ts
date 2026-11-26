import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { ANDROID_BUNDLE_FILE_NAME, androidBuildPath, readAndroidBuilds } from "./android/storage";
import { Config } from "./config";
import { basesRoot } from "./delta";
import { formatBytes } from "./format";
import { writeAtomic } from "./storage";

const COMPACTED_FILE_NAME = "compacted";
const ZSTD_LEVEL = 22;

const zstdCompress = promisify(zlib.zstdCompress);
const zstdDecompress = promisify(zlib.zstdDecompress);

async function compactFile(file: string, marker: string): Promise<void> {
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

async function compactTargets(cutoff: number): Promise<[file: string, marker: string][]> {
    const targets: [string, string][] = [];
    for (const kind of await fs.readdir(basesRoot()).catch(() => [])) {
        for (const name of await fs.readdir(path.join(basesRoot(), kind)).catch(() => [])) {
            const file = path.join(basesRoot(), kind, name);
            if (name.endsWith(".zst")) targets.push([file, `${file}.compacted`]);
        }
    }
    for (const build of await readAndroidBuilds()) {
        const dir = androidBuildPath(build.versionCode);
        if (build.firstSeen < cutoff) targets.push([path.join(dir, ANDROID_BUNDLE_FILE_NAME), path.join(dir, COMPACTED_FILE_NAME)]);
    }
    return targets;
}

export async function compactOldBuilds(): Promise<void> {
    for (const [file, marker] of await compactTargets(Date.now() - Config.compactAfterMs)) {
        await compactFile(file, marker).catch(e => console.error(`[compact] failed to compact ${file}:`, e));
    }
}
