import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { Config } from "../config";
import { idKeyed, wireMeta } from "../msgpack";
import { writeAtomic, writeMpkZst } from "../storage";
import type { DecompiledBundle } from "./decompile";
import type { AndroidBuild } from "./types";

export const ANDROID_META_FILE_NAME = "meta.json";
export const ANDROID_BUNDLE_FILE_NAME = "index.android.bundle.zst";
export const ANDROID_DATA_FILE_NAME = "data.mpk.zst";

const BUNDLE_ZSTD_LEVEL = 10;
const DATA_ZSTD_LEVEL = 10;

const zstdCompress = promisify(zlib.zstdCompress);

export function androidRoot(): string {
    return path.join(Config.dataDir, "android");
}

export function androidBuildPath(versionCode: number): string {
    return path.join(androidRoot(), String(versionCode));
}

// The explorer loads builds by id, Android ones use android-{versionCode}
export function androidBuildId(versionCode: number): string {
    return `android-${versionCode}`;
}

export function parseAndroidBuildId(id: string): number | null {
    const match = /^android-([1-9]\d{0,9})$/.exec(id);
    return match ? Number(match[1]) : null;
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

export async function writeAndroidData(build: AndroidBuild, { modules, depInfo }: DecompiledBundle): Promise<void> {
    await writeMpkZst(path.join(androidBuildPath(build.versionCode), ANDROID_DATA_FILE_NAME), {
        metadata: wireMeta({
            buildHash: androidBuildId(build.versionCode),
            buildNumber: build.versionCode,
            firstSeen: build.firstSeen,
            entryPoint: null,
        }),
        depInfo: {
            keyModules: depInfo.keyModules,
            moduleDeps: idKeyed(depInfo.moduleDeps),
        },
        moduleSources: {},
        modules: idKeyed(modules),
        envVarText: "",
    }, DATA_ZSTD_LEVEL);
}
