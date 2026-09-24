import path from "path";

import { type Channel, isChannel } from "./types";

function intEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
    return value;
}

function channelsEnv(): Channel[] {
    const channels = new Set<Channel>();
    for (const raw of (process.env.TRACK_CHANNELS ?? "stable").split(",")) {
        const channel = raw.trim().toLowerCase();
        if (!channel) continue;
        if (!isChannel(channel)) throw new Error(`Unknown channel "${channel}" in TRACK_CHANNELS`);
        channels.add(channel);
    }

    if (channels.size === 0) {
        throw new Error("TRACK_CHANNELS must include at least one channel");
    }

    return [...channels];
}

export const Config = {
    dataDir: path.resolve(process.env.DATA_DIR ?? "."),
    trackerEnabled: process.env.TRACKER_ENABLED !== "false",
    channels: channelsEnv(),
    pollIntervalMs: intEnv("POLL_INTERVAL_SECONDS", 30) * 1000,
    chunkConcurrency: intEnv("CHUNK_CONCURRENCY", 50),
    bundleCacheSize: intEnv("BUNDLE_CACHE_SIZE", 2),
    sevenZipPath: process.env.SEVEN_ZIP_PATH || null,
    archiveTtlMs: 7 * 24 * 60 * 60 * 1000,
    userAgent: "Discord-Bundle-Downloader/1.0",
};

export const APP_ORIGINS: Record<Channel, string> = {
    stable: "https://discord.com",
    canary: "https://canary.discord.com",
};
