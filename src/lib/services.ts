import { sweepArchives } from "./archive";
import { BuildIndex } from "./buildIndex";
import { persistent } from "./global";
import { sweepModuleStores } from "./moduleStore";
import { ensureBuildsDir } from "./storage";

interface Services {
    index: BuildIndex;
    ready: Promise<void>;
    refreshedAt: number;
    refreshing: Promise<void> | null;
    jobsStarted: boolean;
}

const ARCHIVE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const INDEX_REFRESH_MS = 5 * 1000;

function services(): Services {
    return persistent("services", () => {
        const index = new BuildIndex();
        const ready = ensureBuildsDir().then(() => index.refresh());
        return { index, ready, refreshedAt: Date.now(), refreshing: null, jobsStarted: false };
    });
}

export async function getIndex(): Promise<BuildIndex> {
    const s = services();
    await s.ready;
    if (Date.now() - s.refreshedAt > INDEX_REFRESH_MS) {
        s.refreshing ??= s.index.refresh()
            .catch(e => console.error("[index] refresh failed:", e))
            .finally(() => {
                s.refreshedAt = Date.now();
                s.refreshing = null;
            });
        await s.refreshing;
    }
    return s.index;
}

export async function startBackgroundJobs(): Promise<void> {
    const s = services();
    await s.ready;
    if (s.jobsStarted) return;
    s.jobsStarted = true;

    const sweep = () => Promise.all([
        sweepArchives().catch(e => console.error("[archive] sweep failed:", e)),
        sweepModuleStores().catch(e => console.error("[modules] sweep failed:", e)),
    ]);
    void sweep();
    setInterval(sweep, ARCHIVE_SWEEP_INTERVAL_MS).unref();
}
