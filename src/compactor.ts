import { setTimeout } from "timers/promises";

import { compactOldBuilds } from "./lib/compact";
import { pruneOldBuilds } from "./lib/prune";

const INTERVAL_MS = 6 * 60 * 60 * 1000;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => process.exit(0));
}

for (;;) {
    await pruneOldBuilds().catch(e => console.error("[prune] pass failed:", e));
    await compactOldBuilds().catch(e => console.error("[compact] pass failed:", e));
    await setTimeout(INTERVAL_MS);
}
