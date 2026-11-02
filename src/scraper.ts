import { AndroidTracker } from "./lib/android/tracker";
import { BuildIndex } from "./lib/buildIndex";
import { Config } from "./lib/config";
import { ensureBuildsDir } from "./lib/storage";
import { Tracker } from "./lib/tracker";
import { removeTrackerStatus, STATUS_INTERVAL_MS, writeTrackerStatus } from "./lib/trackerStatus";

await ensureBuildsDir();
const index = new BuildIndex();
await index.refresh();

const tracker = new Tracker(index);
tracker.start();

const android = Config.vendettaApiUrl ? new AndroidTracker(Config.vendettaApiUrl) : null;
await android?.start();

const publish = () => writeTrackerStatus({ ...tracker.snapshot(), android: android?.snapshot() ?? null }).catch(e => console.error("[tracker] failed to write status:", e));
void publish();
setInterval(publish, STATUS_INTERVAL_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
        await removeTrackerStatus().catch(() => { });
        process.exit(0);
    });
}
