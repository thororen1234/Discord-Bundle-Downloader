import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { Config } from "./config";
import { ARCHIVE_FILE_NAME, buildPath, buildsRoot, exists, readFullBundle, readMetadata } from "./storage";
import { withChannels } from "./types";

const execFileAsync = promisify(execFile);

const g = globalThis as typeof globalThis & { __archivesInFlight?: Map<string, Promise<string>>; };
const inFlight = g.__archivesInFlight ??= new Map();

async function sevenZipBinary(): Promise<string> {
    if (Config.sevenZipPath) return Config.sevenZipPath;
    const { path7za } = await import("7zip-bin");
    return path7za;
}

async function createArchive(buildHash: string, target: string): Promise<void> {
    const bundle = await readFullBundle(buildHash);
    const metadata = withChannels(await readMetadata(buildHash));
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `dbd-${buildHash.slice(0, 8)}-`));
    try {
        const srcDir = path.join(workDir, "src");
        await fs.mkdir(path.join(srcDir, ".modules"), { recursive: true });

        const ids = Object.keys(bundle.modules);
        for (let i = 0; i < ids.length; i += 256) {
            await Promise.all(ids.slice(i, i + 256).map(id =>
                fs.writeFile(path.join(srcDir, ".modules", `${id}.js`), bundle.modules[id])
            ));
        }
        await fs.writeFile(path.join(srcDir, "deps.json"), JSON.stringify(bundle.depInfo));
        await fs.writeFile(path.join(srcDir, "info.json"), JSON.stringify(metadata));
        await fs.writeFile(path.join(srcDir, "modules.json"), JSON.stringify(bundle.moduleSources));

        const out = path.join(workDir, ARCHIVE_FILE_NAME);
        await execFileAsync(await sevenZipBinary(), ["a", "-t7z", "-mx=6", "-md=16m", "-mmt=on", "-bd", "-bso0", out, "."], {
            cwd: srcDir,
            maxBuffer: 16 * 1024 * 1024,
        });

        const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
        await fs.copyFile(out, tmp);
        await fs.rename(tmp, target);
    } finally {
        await fs.rm(workDir, { recursive: true, force: true });
    }
}

export function getArchive(buildHash: string): Promise<string> {
    const target = path.join(buildPath(buildHash), ARCHIVE_FILE_NAME);
    let pending = inFlight.get(buildHash);
    if (!pending) {
        pending = (async () => {
            if (!await exists(target)) {
                const start = performance.now();
                await createArchive(buildHash, target);
                console.log(`[archive] built ${buildHash}.7z in ${((performance.now() - start) / 1000).toFixed(1)}s`);
            }
            return target;
        })().finally(() => inFlight.delete(buildHash));
        inFlight.set(buildHash, pending);
    }
    return pending;
}

export async function invalidateArchive(buildHash: string): Promise<void> {
    await inFlight.get(buildHash)?.catch(() => { });
    await fs.rm(path.join(buildPath(buildHash), ARCHIVE_FILE_NAME), { force: true });
}

export async function sweepArchives(): Promise<void> {
    const cutoff = Date.now() - Config.archiveTtlMs;
    const dirs = await fs.readdir(buildsRoot(), { withFileTypes: true });
    for (const dir of dirs) {
        if (!dir.isDirectory() || inFlight.has(dir.name)) continue;
        const file = path.join(buildsRoot(), dir.name, ARCHIVE_FILE_NAME);
        const stat = await fs.stat(file).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) {
            await fs.rm(file, { force: true });
            console.log(`[archive] expired ${dir.name}.7z`);
        }
    }
}
