import { sweepArchives } from "./archive";
import { BuildIndex } from "./buildIndex";
import { Config } from "./config";
import { persistent } from "./global";
import { ensureBuildsDir } from "./storage";
import { Tracker } from "./tracker";

interface Services {
    index: BuildIndex;
    ready: Promise<void>;
    tracker: Tracker | null;
}

const ARCHIVE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function services(): Services {
    return persistent("services", () => {
        const index = new BuildIndex();
        const ready = ensureBuildsDir().then(() => index.populateFromDisk());
        return { index, ready, tracker: null };
    });
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
