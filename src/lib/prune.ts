import fs from "fs/promises";
import path from "path";

import { ANDROID_PATCH_FILE_NAME, androidBuildPath, androidRoot, readAndroidBuilds } from "./android/storage";
import { ANDROID_CHANNELS } from "./android/types";
import { BuildIndex } from "./buildIndex";
import { Config } from "./config";
import { basesRoot, readDeltaBase } from "./delta";
import { buildPath, buildsRoot, PATCH_FILE_NAME } from "./storage";
import { CHANNELS } from "./types";

const BASE_GRACE_MS = 24 * 60 * 60 * 1000;

export async function pruneOldBuilds(): Promise<void> {
    const keep = Config.keepLatestBuilds;
    if (!Number.isFinite(keep)) return;

    const index = new BuildIndex();
    await index.refresh();
    const keepWeb = new Set(CHANNELS.flatMap(c => index.list(c).slice(-keep).map(m => m.buildHash)));
    for (const meta of index.list()) {
        if (keepWeb.has(meta.buildHash)) continue;
        await fs.rm(buildPath(meta.buildHash), { recursive: true, force: true });
        console.log(`[prune] removed build ${meta.buildNumber} (${meta.buildHash})`);
    }

    const android = await readAndroidBuilds();
    const keepAndroid = new Set(ANDROID_CHANNELS.flatMap(c => android.filter(b => b.channels.includes(c)).slice(-keep).map(b => b.versionCode)));
    for (const build of android) {
        if (keepAndroid.has(build.versionCode)) continue;
        await fs.rm(androidBuildPath(build.versionCode), { recursive: true, force: true });
        console.log(`[prune] removed android build ${build.version} (${build.versionCode})`);
    }

    const patches = [
        ...(await fs.readdir(buildsRoot())).map(name => path.join(buildsRoot(), name, PATCH_FILE_NAME)),
        ...(await fs.readdir(androidRoot()).catch(() => [])).map(name => path.join(androidRoot(), name, ANDROID_PATCH_FILE_NAME)),
    ];
    const used = new Set<string>();
    for (const file of patches) {
        const base = await readDeltaBase(file).catch(e => {
            if (e.code === "ENOENT") return null;
            throw e;
        });
        if (base) used.add(base);
    }
    const cutoff = Date.now() - BASE_GRACE_MS;
    for (const kind of await fs.readdir(basesRoot()).catch(() => [])) {
        for (const name of await fs.readdir(path.join(basesRoot(), kind))) {
            const file = path.join(basesRoot(), kind, name);
            if (!name.endsWith(".zst") || used.has(`${kind}/${name}`) || (await fs.stat(file)).mtimeMs > cutoff) continue;
            await fs.rm(file);
            await fs.rm(`${file}.compacted`, { force: true });
            console.log(`[prune] removed unused base ${kind}/${name}`);
        }
    }
}
