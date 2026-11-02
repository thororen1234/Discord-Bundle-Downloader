import fs from "fs/promises";
import path from "path";

import type { AndroidSnapshot } from "./android/tracker";
import { Config } from "./config";
import type { ChannelStatus, Failure, ScrapeJob } from "./tracker";
import type { Channel } from "./types";

export interface TrackerSnapshot {
    updatedAt: number;
    channels: Channel[];
    status: Record<Channel, ChannelStatus>;
    jobs: ScrapeJob[];
    failures: [string, Failure][];
    android?: AndroidSnapshot | null;
}

export const STATUS_INTERVAL_MS = 2000;
const STALE_AFTER_MS = 15 * 1000;

function statusPath(): string {
    return path.join(Config.dataDir, "tracker.json");
}

export async function writeTrackerStatus(snapshot: TrackerSnapshot): Promise<void> {
    const file = statusPath();
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot));
    await fs.rename(tmp, file);
}

export async function removeTrackerStatus(): Promise<void> {
    await fs.rm(statusPath(), { force: true });
}

export async function readTrackerStatus(): Promise<TrackerSnapshot | null> {
    try {
        const snapshot: TrackerSnapshot = JSON.parse(await fs.readFile(statusPath(), "utf8"));
        return Date.now() - snapshot.updatedAt < STALE_AFTER_MS ? snapshot : null;
    } catch {
        return null;
    }
}
