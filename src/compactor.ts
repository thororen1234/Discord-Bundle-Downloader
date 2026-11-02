import { setTimeout } from "timers/promises";

import { compactOldBuilds } from "./lib/compact";

const INTERVAL_MS = 6 * 60 * 60 * 1000;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => process.exit(0));
}

for (;;) {
    await compactOldBuilds().catch(e => console.error("[compact] pass failed:", e));
    await setTimeout(INTERVAL_MS);
}
