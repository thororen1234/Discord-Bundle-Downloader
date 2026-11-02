import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { Config } from "../config";
import { writeAtomic } from "../storage";
import type { AndroidBuild } from "./types";

export const ANDROID_META_FILE_NAME = "meta.json";
export const ANDROID_BUNDLE_FILE_NAME = "index.android.bundle.zst";

const BUNDLE_ZSTD_LEVEL = 10;

const zstdCompress = promisify(zlib.zstdCompress);

export function androidRoot(): string {
    return path.join(Config.dataDir, "android");
}

export function androidBuildPath(versionCode: number): string {
    return path.join(androidRoot(), String(versionCode));
}

export function isValidVersionCode(raw: string): boolean {
    return /^[1-9]\d{0,9}$/.test(raw);
}

export async function readAndroidBuilds(): Promise<AndroidBuild[]> {
    const entries = await fs.readdir(androidRoot(), { withFileTypes: true }).catch(() => []);
    const builds = await Promise.all(entries.map(async entry => {
        if (!entry.isDirectory() || !isValidVersionCode(entry.name)) return null;
        const file = path.join(androidRoot(), entry.name, ANDROID_META_FILE_NAME);
        try {
            return JSON.parse(await fs.readFile(file, "utf8")) as AndroidBuild;
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[android] skipping ${entry.name}, metadata is unreadable:`, e);
            return null;
        }
    }));
    return builds.filter(b => b != null).sort((a, b) => a.versionCode - b.versionCode);
}

export async function writeAndroidMeta(build: AndroidBuild): Promise<void> {
    await writeAtomic(path.join(androidBuildPath(build.versionCode), ANDROID_META_FILE_NAME), Buffer.from(JSON.stringify(build)));
}

export async function writeAndroidBuild(build: AndroidBuild, bundle: Buffer): Promise<void> {
    const dir = androidBuildPath(build.versionCode);
    await fs.mkdir(dir, { recursive: true });
    const compressed = await zstdCompress(bundle, {
        params: { [zlib.constants.ZSTD_c_compressionLevel]: BUNDLE_ZSTD_LEVEL },
    });
    await writeAtomic(path.join(dir, ANDROID_BUNDLE_FILE_NAME), compressed);
    await writeAndroidMeta(build);
}
