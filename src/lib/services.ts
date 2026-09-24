import fs from "fs/promises";

import { sweepArchives } from "./archive";
import { BuildIndex } from "./buildIndex";
import { Config } from "./config";
import { buildPath, ensureBuildsDir } from "./storage";
import { Tracker } from "./tracker";

interface Services {
    index: BuildIndex;
    ready: Promise<void>;
    tracker: Tracker | null;
}

const ARCHIVE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const g = globalThis as typeof globalThis & { __bundleDownloader?: Services; };

function services(): Services {
    if (!g.__bundleDownloader) {
        const index = new BuildIndex();
        const ready = ensureBuildsDir().then(() => index.populateFromDisk());
        g.__bundleDownloader = { index, ready, tracker: null };
    }
    return g.__bundleDownloader;
}

export async function getIndex(): Promise<BuildIndex> {
    const s = services();
    await s.ready;
    return s.index;
}

export function getTracker(): Tracker | null {
    return services().tracker;
}

export async function startBackgroundJobs(): Promise<void> {
    const s = services();
    await s.ready;
    if (s.tracker || !Config.trackerEnabled) return;

    s.tracker = new Tracker(s.index);
    s.tracker.start();

    const sweep = () => sweepArchives().catch(e => console.error("[archive] sweep failed:", e));
    void sweep();
    setInterval(sweep, ARCHIVE_SWEEP_INTERVAL_MS).unref();
}

export async function fixupTimestamps(): Promise<void> {
    const index = await getIndex();
    for (const meta of index.list()) {
        const time = new Date(meta.firstSeen);
        await fs.utimes(buildPath(meta.buildHash), time, time);
    }
    await index.populateFromDisk();
}
