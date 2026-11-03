import path from "path";

import { type Channel, isChannel } from "./types";

function intEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
    return value;
}

function boolEnv(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw == null) return fallback;
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`${name} must be "true" or "false", got "${raw}"`);
}

function urlEnv(name: string): string | null {
    const raw = process.env[name];
    if (!raw) return null;
    const protocol = URL.parse(raw)?.protocol;
    if (protocol !== "http:" && protocol !== "https:") throw new Error(`${name} must be an http(s) URL, got "${raw}"`);
    return raw.replace(/\/+$/, "");
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
    channels: channelsEnv(),
    pollIntervalMs: intEnv("POLL_INTERVAL_SECONDS", 30) * 1000,
    chunkConcurrency: intEnv("CHUNK_CONCURRENCY", 50),
    archivePrebuild: boolEnv("ARCHIVE_PREBUILD", false),
    archiveThreads: intEnv("ARCHIVE_THREADS", 4),
    archiveCompressionLevel: intEnv("ARCHIVE_COMPRESSION_LEVEL", 3),
    sevenZipPath: process.env.SEVEN_ZIP_PATH || null,
    archiveTtlMs: 7 * 24 * 60 * 60 * 1000,
    moduleCacheMaxBytes: intEnv("MODULE_CACHE_MAX_GB", 20) * 1024 ** 3,
    userAgent: "Discord-Bundle-Downloader/1.0",
    vendettaApiUrl: urlEnv("VENDETTA_API_URL"),
    vendettaPollIntervalMs: intEnv("VENDETTA_POLL_INTERVAL_SECONDS", 300) * 1000,
    vendettaWebhookSecret: process.env.VENDETTA_WEBHOOK_SECRET || null,
    vendettaWebhookPort: intEnv("VENDETTA_WEBHOOK_PORT", 8485),
    hermesDecompilerPath: process.env.HERMES_DECOMPILER_PATH || "hbc-decompiler",
    compactAfterMs: intEnv("COMPACT_AFTER_DAYS", 30) * 24 * 60 * 60 * 1000,
};

export const APP_ORIGINS: Record<Channel, string> = {
    stable: "https://discord.com",
    ptb: "https://ptb.discord.com",
    canary: "https://canary.discord.com",
};
