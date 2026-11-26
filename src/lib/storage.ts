import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { Config } from "./config";
import { readDelta, writeDelta } from "./delta";
import { idKeyed, pack, unpack, wireMeta } from "./msgpack";
import type { BundleMetadata, FullBundle } from "./types";

export const DATA_FILE_NAME = "data.mpk.zst";
export const PATCH_FILE_NAME = "data.patch";
export const METADATA_FILE_NAME = "meta.mpk.zst";
export const ARCHIVE_FILE_NAME = "archive.7z";

const FORMAT_VERSION = "6";
const METADATA_ZSTD_LEVEL = 0;
const DELTA_MAX_RATIO = 160;

const zstdCompress = promisify(zlib.zstdCompress);
const zstdDecompress = promisify(zlib.zstdDecompress);

export function buildsRoot(): string {
    return path.join(Config.dataDir, "builds");
}

export function buildPath(buildHash: string): string {
    return path.join(buildsRoot(), buildHash);
}

export function isValidBuildHash(buildHash: string): boolean {
    return /^[0-9a-f]{1,64}$/i.test(buildHash);
}

export async function exists(p: string): Promise<boolean> {
    return fs.access(p).then(() => true, () => false);
}

export async function ensureBuildsDir(): Promise<void> {
    await fs.mkdir(buildsRoot(), { recursive: true });
    const verPath = path.join(buildsRoot(), ".ver");
    const version = await fs.readFile(verPath, "utf8").then(v => v.trim(), () => null);
    if (version == null || version === "5") {
        await fs.writeFile(verPath, FORMAT_VERSION);
    } else if (version !== FORMAT_VERSION) {
        throw new Error(
            `${verPath} is version ${version}, expected ${FORMAT_VERSION}.`
        );
    }
}

export async function readMpkZst<T>(file: string): Promise<T> {
    return unpack<T>(await zstdDecompress(await fs.readFile(file)));
}

export async function writeAtomic(file: string, data: Uint8Array): Promise<void> {
    const tmp = `${file}.${process.pid}.tmp`;
    const handle = await fs.open(tmp, "w");
    try {
        await handle.writeFile(data);
        await handle.sync();
    } finally {
        await handle.close();
    }
    await fs.rename(tmp, file);
}

export async function writeMpkZst(file: string, value: unknown, level: number): Promise<void> {
    const compressed = await zstdCompress(pack(value), {
        params: { [zlib.constants.ZSTD_c_compressionLevel]: level },
    });
    await writeAtomic(file, compressed);
}

export function packMetadataZst(meta: BundleMetadata): Buffer {
    return zlib.zstdCompressSync(pack(wireMeta(meta)));
}

export function readMetadata(buildHash: string): Promise<BundleMetadata> {
    return readMpkZst(path.join(buildPath(buildHash), METADATA_FILE_NAME));
}

export async function hasBundle(buildHash: string): Promise<boolean> {
    const dir = buildPath(buildHash);
    return await exists(path.join(dir, PATCH_FILE_NAME)) || exists(path.join(dir, DATA_FILE_NAME));
}

export async function readBundleRaw(buildHash: string): Promise<Buffer> {
    const dir = buildPath(buildHash);
    if (await exists(path.join(dir, PATCH_FILE_NAME))) return readDelta(path.join(dir, PATCH_FILE_NAME));
    return zstdDecompress(await fs.readFile(path.join(dir, DATA_FILE_NAME)));
}

export async function readFullBundle(buildHash: string): Promise<FullBundle> {
    return unpack<FullBundle>(await readBundleRaw(buildHash));
}

export async function writeMetadata(meta: BundleMetadata): Promise<void> {
    const dir = buildPath(meta.buildHash);
    await fs.mkdir(dir, { recursive: true });
    await writeMpkZst(path.join(dir, METADATA_FILE_NAME), wireMeta(meta), METADATA_ZSTD_LEVEL);
}

export async function writeBundleRaw(meta: BundleMetadata, raw: Uint8Array): Promise<void> {
    const dir = buildPath(meta.buildHash);
    await fs.mkdir(dir, { recursive: true });
    await writeDelta(path.join(dir, PATCH_FILE_NAME), raw, { kind: "web", key: meta.firstSeen, id: meta.buildHash, maxRatio: DELTA_MAX_RATIO });
    await fs.rm(path.join(dir, DATA_FILE_NAME), { force: true });
}

export async function writeFullBundle(bundle: FullBundle): Promise<void> {
    await writeBundleRaw(bundle.metadata, pack({
        metadata: wireMeta(bundle.metadata),
        depInfo: {
            keyModules: bundle.depInfo.keyModules,
            moduleDeps: idKeyed(bundle.depInfo.moduleDeps),
        },
        moduleSources: bundle.moduleSources,
        modules: idKeyed(bundle.modules),
        envVarText: bundle.envVarText,
        experiments: bundle.experiments ?? [],
        cssChunks: bundle.cssChunks ?? {},
    }));
    await writeMetadata(bundle.metadata);
}
