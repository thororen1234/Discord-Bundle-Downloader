import { BuildIndex } from "./lib/buildIndex";
import { ensureBuildsDir } from "./lib/storage";
import { Tracker } from "./lib/tracker";
import { removeTrackerStatus, STATUS_INTERVAL_MS, writeTrackerStatus } from "./lib/trackerStatus";

await ensureBuildsDir();
const index = new BuildIndex();
await index.refresh();

const tracker = new Tracker(index);
tracker.start();

const publish = () => writeTrackerStatus(tracker.snapshot()).catch(e => console.error("[tracker] failed to write status:", e));
void publish();
setInterval(publish, STATUS_INTERVAL_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
        await removeTrackerStatus().catch(() => { });
        process.exit(0);
    });
}
