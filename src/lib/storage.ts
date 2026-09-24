import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { Config } from "./config";
import { idKeyed, pack, unpack, wireMeta } from "./msgpack";
import type { BundleMetadata, FullBundle } from "./types";

export const DATA_FILE_NAME = "data.mpk.zst";
export const METADATA_FILE_NAME = "meta.mpk.zst";
export const ARCHIVE_FILE_NAME = "archive.7z";

const FORMAT_VERSION = "5";
const METADATA_ZSTD_LEVEL = 0;
const DATA_ZSTD_LEVEL = 10;

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
    if (version == null) {
        await fs.writeFile(verPath, FORMAT_VERSION);
    } else if (version !== FORMAT_VERSION) {
        throw new Error(
            `${verPath} is version ${version}, expected ${FORMAT_VERSION}. Run explorer_server once to migrate it.`
        );
    }
}

export async function readMpkZst<T>(file: string): Promise<T> {
    return unpack<T>(await zstdDecompress(await fs.readFile(file)));
}

async function writeAtomic(file: string, data: Uint8Array): Promise<void> {
    const tmp = `${file}.tmp`;
    const handle = await fs.open(tmp, "w");
    try {
        await handle.writeFile(data);
        await handle.sync();
    } finally {
        await handle.close();
    }
    await fs.rename(tmp, file);
}

async function writeMpkZst(file: string, value: unknown, level: number): Promise<void> {
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

export function readFullBundle(buildHash: string): Promise<FullBundle> {
    return readMpkZst(path.join(buildPath(buildHash), DATA_FILE_NAME));
}

export async function writeMetadata(meta: BundleMetadata): Promise<void> {
    const dir = buildPath(meta.buildHash);
    await fs.mkdir(dir, { recursive: true });
    await writeMpkZst(path.join(dir, METADATA_FILE_NAME), wireMeta(meta), METADATA_ZSTD_LEVEL);
}

export async function writeFullBundle(bundle: FullBundle): Promise<void> {
    const dir = buildPath(bundle.metadata.buildHash);
    await fs.mkdir(dir, { recursive: true });
    await writeMpkZst(path.join(dir, DATA_FILE_NAME), {
        metadata: wireMeta(bundle.metadata),
        depInfo: {
            keyModules: bundle.depInfo.keyModules,
            moduleDeps: idKeyed(bundle.depInfo.moduleDeps),
        },
        moduleSources: bundle.moduleSources,
        modules: idKeyed(bundle.modules),
        envVarText: bundle.envVarText,
    }, DATA_ZSTD_LEVEL);
    await writeMetadata(bundle.metadata);
}
