/*
 * Copies every build from a running explorer_server (or another instance of this) into DATA_DIR, so a new
 * deployment starts with the full history. Builds that are already here are skipped.
 *
 *   pnpm mirror [--base-url https://s-d-br.sadan.zip] [--concurrency 4]
 */

import fs from "fs/promises";
import path from "path";
import zlib from "zlib";

import { Config } from "../src/lib/config";
import { unpack } from "../src/lib/msgpack";
import { buildPath, DATA_FILE_NAME, ensureBuildsDir, exists, METADATA_FILE_NAME } from "../src/lib/storage";
import type { BundleMetadata } from "../src/lib/types";

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
}

const baseUrl = arg("base-url", "https://s-d-br.sadan.zip").replace(/\/?$/, "/");
const concurrency = Number(arg("concurrency", "4"));

async function fetchBytes(url: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { "User-Agent": Config.userAgent } });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
}

await ensureBuildsDir();
const { builds } = unpack<{ builds: number[][]; }>(await fetchBytes(new URL("builds", baseUrl).href));
console.log(`${builds.length} builds on ${baseUrl}`);

const queue = builds.map(raw => Buffer.from(raw));
let copied = 0, skipped = 0, failed = 0;

async function worker() {
    for (let raw = queue.shift(); raw; raw = queue.shift()) {
        const meta = unpack<BundleMetadata>(zlib.zstdDecompressSync(raw));
        const dir = buildPath(meta.buildHash);
        if (await exists(path.join(dir, DATA_FILE_NAME))) {
            skipped++;
            continue;
        }
        try {
            const data = await fetchBytes(new URL(`build/${meta.buildHash}/full`, baseUrl).href);
            await fs.mkdir(dir, { recursive: true });
            // data first, a build only counts once its metadata exists
            await fs.writeFile(path.join(dir, DATA_FILE_NAME), data);
            await fs.writeFile(path.join(dir, METADATA_FILE_NAME), raw);
            copied++;
            console.log(`  ${meta.buildNumber} ${meta.buildHash} (${(data.length / 1e6).toFixed(1)} MB)`);
        } catch (e) {
            failed++;
            console.error(`  failed ${meta.buildHash}:`, e);
        }
    }
}

await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`Done: ${copied} copied, ${skipped} already here, ${failed} failed. Saved to ${Config.dataDir}`);
if (failed) process.exitCode = 1;
