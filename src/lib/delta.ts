import { execFile } from "child_process";
import { createHash } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";

import { Config } from "./config";
import { writeAtomic } from "./storage";

const BASE_ZSTD_LEVEL = 10;
const PATCH_ZSTD_LEVEL = 10;

const execFileAsync = promisify(execFile);
const zstdCompress = promisify(zlib.zstdCompress);
const zstdDecompress = promisify(zlib.zstdDecompress);

export interface DeltaBase {
    kind: string;
    key: number;
    id: string;
    maxRatio: number;
}

export function basesRoot(): string {
    return path.join(Config.dataDir, "bases");
}

// zstd gets ENOSPC writing to a full pipe on Windows, so it only reads and writes files
async function zstd(work: string, args: string[], input: Uint8Array): Promise<Buffer> {
    await fs.writeFile(path.join(work, "in"), input);
    await execFileAsync(Config.zstdPath, ["-q", "-f", ...args, path.join(work, "in"), "-o", path.join(work, "out")]);
    return fs.readFile(path.join(work, "out"));
}

async function applyPatch(work: string, patch: Uint8Array): Promise<Buffer> {
    return zstd(work, ["-d", "--memory=2048MB", `--patch-from=${path.join(work, "base")}`], patch);
}

export async function readDelta(file: string): Promise<Buffer> {
    const data = await fs.readFile(file);
    const newline = data.indexOf(10);
    const base = await zstdDecompress(await fs.readFile(path.join(basesRoot(), data.toString("utf8", 0, newline))));
    const patch = data.subarray(newline + 1);
    if (!patch.length) return base;

    const work = await fs.mkdtemp(path.join(os.tmpdir(), "dbd-delta-"));
    try {
        await fs.writeFile(path.join(work, "base"), base);
        return await applyPatch(work, patch);
    } finally {
        await fs.rm(work, { recursive: true, force: true });
    }
}

export async function readDeltaBase(file: string): Promise<string> {
    const handle = await fs.open(file);
    try {
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(256), 0, 256, 0);
        return buffer.toString("utf8", 0, buffer.subarray(0, bytesRead).indexOf(10));
    } finally {
        await handle.close();
    }
}

export async function writeDelta(file: string, raw: Uint8Array, { kind, key, id, maxRatio }: DeltaBase): Promise<void> {
    const dir = path.join(basesRoot(), kind);
    await fs.mkdir(dir, { recursive: true });
    const prefix = `${String(key).padStart(13, "0")}-${id}-`;
    const own = `${prefix}${createHash("sha256").update(raw).digest("hex").slice(0, 16)}.zst`;
    const names = (await fs.readdir(dir)).filter(n => n.endsWith(".zst")).sort();
    let name: string | undefined = names.findLast(n => n.startsWith(prefix)) ?? names.findLast(n => n < own) ?? names[0];
    let patch: Buffer = Buffer.alloc(0);

    const work = await fs.mkdtemp(path.join(os.tmpdir(), "dbd-delta-"));
    try {
        if (name) {
            const base = await zstdDecompress(await fs.readFile(path.join(dir, name)));
            await fs.writeFile(path.join(work, "base"), base);
            patch = await zstd(work, [`-${PATCH_ZSTD_LEVEL}`, `--patch-from=${path.join(work, "base")}`], raw);
            if (!name.startsWith(prefix) && patch.length * maxRatio > base.length) {
                name = undefined;
            } else if (!(await applyPatch(work, patch)).equals(raw)) {
                throw new Error(`patch for ${file} does not reproduce the input`);
            }
        }
        if (!name) {
            name = own;
            patch = Buffer.alloc(0);
            await writeAtomic(path.join(dir, own), await zstdCompress(raw, {
                params: { [zlib.constants.ZSTD_c_compressionLevel]: BASE_ZSTD_LEVEL },
            }));
        }
        await writeAtomic(file, Buffer.concat([Buffer.from(`${kind}/${name}\n`), patch]));
    } finally {
        await fs.rm(work, { recursive: true, force: true });
    }
}
