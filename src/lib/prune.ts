import fs from "fs/promises";

import { androidBuildPath, readAndroidBuilds } from "./android/storage";
import { ANDROID_CHANNELS } from "./android/types";
import { BuildIndex } from "./buildIndex";
import { Config } from "./config";
import { buildPath } from "./storage";
import { CHANNELS } from "./types";

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
}
