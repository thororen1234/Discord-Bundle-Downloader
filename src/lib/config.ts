import path from "path";

import type { Channel } from "./types";

const CHANNELS: readonly Channel[] = ["stable", "canary"];

function intEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
    return value;
}

function channelsEnv(): Channel[] {
    const raw = process.env.TRACK_CHANNELS ?? "stable";
    const channels = raw.split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
    for (const c of channels) {
        if (!CHANNELS.includes(c as Channel)) throw new Error(`Unknown channel "${c}" in TRACK_CHANNELS`);
    }
    return [...new Set(channels)] as Channel[];
}

export const Config = {
    dataDir: path.resolve(process.env.DATA_DIR ?? "."),
    trackerEnabled: process.env.TRACKER_ENABLED !== "false",
    channels: channelsEnv(),
    pollIntervalMs: intEnv("POLL_INTERVAL_SECONDS", 30) * 1000,
    chunkConcurrency: intEnv("CHUNK_CONCURRENCY", 50),
    bundleCacheSize: intEnv("BUNDLE_CACHE_SIZE", 2),
    adminToken: process.env.ADMIN_TOKEN || null,
    sevenZipPath: process.env.SEVEN_ZIP_PATH || null,
    archiveTtlMs: 7 * 24 * 60 * 60 * 1000,
    userAgent: "Discord-Bundle-Downloader/1.0",
};

export const APP_ORIGINS: Record<Channel, string> = {
    stable: "https://discord.com",
    canary: "https://canary.discord.com",
};
