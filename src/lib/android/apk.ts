import fs from "fs/promises";
import { promisify } from "util";
import zlib from "zlib";

const inflateRaw = promisify(zlib.inflateRaw);

const EOCD_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const HERMES_MAGIC = 0x1F1903C103BC1FC6n;

async function readAt(handle: fs.FileHandle, position: number, length: number): Promise<Buffer> {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead !== length) throw new Error("APK is truncated");
    return buffer;
}

export async function readZipEntry(file: string, name: string): Promise<Buffer> {
    const handle = await fs.open(file, "r");
    try {
        const { size } = await handle.stat();
        const tailSize = Math.min(size, 0xffff + 22);
        const tail = await readAt(handle, size - tailSize, tailSize);
        const eocd = tail.lastIndexOf(EOCD_SIGNATURE);
        if (eocd < 0) throw new Error("APK is not a zip file");

        const count = tail.readUInt16LE(eocd + 10);
        const directory = await readAt(handle, tail.readUInt32LE(eocd + 16), tail.readUInt32LE(eocd + 12));
        for (let p = 0, i = 0; i < count; i++) {
            if (directory.readUInt32LE(p) !== CENTRAL_SIGNATURE) throw new Error("APK has a corrupt central directory");
            const method = directory.readUInt16LE(p + 10);
            const crc = directory.readUInt32LE(p + 16);
            const compressedSize = directory.readUInt32LE(p + 20);
            const nameLength = directory.readUInt16LE(p + 28);
            const localOffset = directory.readUInt32LE(p + 42);
            const entryName = directory.toString("utf8", p + 46, p + 46 + nameLength);
            p += 46 + nameLength + directory.readUInt16LE(p + 30) + directory.readUInt16LE(p + 32);
            if (entryName !== name) continue;

            const local = await readAt(handle, localOffset, 30);
            if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error(`APK has a corrupt header for ${name}`);
            const raw = await readAt(handle, localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), compressedSize);
            let data: Buffer;
            if (method === 0) data = raw;
            else if (method === 8) data = await inflateRaw(raw);
            else throw new Error(`${name} uses unsupported zip compression method ${method}`);
            if (zlib.crc32(data) !== crc) throw new Error(`${name} failed its CRC check`);
            return data;
        }
        throw new Error(`${name} is not in the APK`);
    } finally {
        await handle.close();
    }
}

export function hermesVersion(bundle: Buffer): number | null {
    if (bundle.length < 12 || bundle.readBigUInt64LE(0) !== HERMES_MAGIC) return null;
    return bundle.readUInt32LE(8);
}
