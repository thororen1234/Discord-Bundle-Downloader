import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import zlib from "zlib";

import { Config } from "../config";
import { type Failure, nextFailure } from "../tracker";
import { hermesVersion, readZipEntry } from "./apk";
import { decompileHermes, splitModules } from "./decompile";
import {
    ANDROID_BUNDLE_FILE_NAME,
    androidBuildPath,
    readAndroidBuilds,
    writeAndroidBuild,
    writeAndroidData,
    writeAndroidMeta,
} from "./storage";
import { ANDROID_CHANNELS, type AndroidBuild, type AndroidChannel, type AndroidRelease, parseAndroidRelease } from "./types";
import { startWebhookServer } from "./webhook";

export interface AndroidJob {
    versionCode: number;
    channel: AndroidChannel;
    startedAt: number;
    stage: string;
    bytesDone: number;
    bytesTotal: number;
}

export interface AndroidSnapshot {
    checkedAt: number | null;
    error: string | null;
    latest: Partial<Record<AndroidChannel, number>>;
    jobs: AndroidJob[];
    failures: [number, Failure][];
}

const BUNDLE_ENTRY = "assets/index.android.bundle";
const CHECK_TIMEOUT_MS = 20 * 1000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

export class AndroidTracker {
    private readonly builds = new Map<number, AndroidBuild>();
    private readonly jobs = new Map<number, AndroidJob>();
    private readonly failures = new Map<number, Failure>();
    private readonly latest: Partial<Record<AndroidChannel, number>> = {};
    private checkedAt: number | null = null;
    private error: string | null = null;
    private queue = Promise.resolve();
    // decompiling takes minutes per build, keep it from holding up downloads
    private decompileQueue = Promise.resolve();

    constructor(private readonly apiUrl: string) { }

    async start() {
        for (const build of await readAndroidBuilds()) this.builds.set(build.versionCode, build);
        console.log(`[android] loaded ${this.builds.size} builds, polling ${this.apiUrl} every ${Config.vendettaPollIntervalMs / 1000}s`);
        for (const build of [...this.builds.values()].reverse()) {
            if (build.hermesVersion != null && build.modules == null) this.queueDecompile(build.versionCode);
        }
        void this.poll();
        setInterval(() => void this.poll(), Config.vendettaPollIntervalMs);
        if (Config.vendettaWebhookSecret) {
            startWebhookServer(Config.vendettaWebhookPort, Config.vendettaWebhookSecret, (channel, release) => this.see(channel, release));
        }
    }

    snapshot(): AndroidSnapshot {
        return {
            checkedAt: this.checkedAt,
            error: this.error,
            latest: this.latest,
            jobs: [...this.jobs.values()],
            failures: [...this.failures.entries()],
        };
    }

    private async poll() {
        try {
            const response = await fetch(`${this.apiUrl}/android/index`, {
                headers: { "User-Agent": Config.userAgent },
                signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const { latest } = await response.json();
            this.checkedAt = Date.now();
            this.error = null;
            for (const channel of ANDROID_CHANNELS) {
                const release = parseAndroidRelease(latest?.[channel]);
                if (release) this.see(channel, release);
            }
        } catch (error) {
            this.error = `Failed to read VendettaAPI index: ${error}`;
        }
    }

    see(channel: AndroidChannel, release: AndroidRelease) {
        const { versionCode } = release;
        if (this.latest[channel] !== versionCode) {
            this.latest[channel] = versionCode;
            console.log(`[android] ${channel} is on ${release.version} (${versionCode})`);
        }

        const known = this.builds.get(versionCode);
        if (known) {
            if (!known.channels.includes(channel)) this.addChannel(known, channel);
            return;
        }
        if (this.jobs.has(versionCode)) return;
        if ((this.failures.get(versionCode)?.retryAt ?? 0) > Date.now()) return;

        const job: AndroidJob = { versionCode, channel, startedAt: Date.now(), stage: "Queued", bytesDone: 0, bytesTotal: 0 };
        this.jobs.set(versionCode, job);
        this.queue = this.queue.then(() => this.download(job, release));
    }

    private async download(job: AndroidJob, release: AndroidRelease) {
        const { versionCode, channel } = job;
        job.startedAt = Date.now();
        let workDir: string | null = null;
        try {
            workDir = await fs.mkdtemp(path.join(os.tmpdir(), `dbd-android-${versionCode}-`));
            job.stage = "Downloading";
            const apk = path.join(workDir, "base.apk");
            const response = await fetch(`${this.apiUrl}/android/download/${versionCode}/base`, {
                headers: { "User-Agent": Config.userAgent },
                signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
            });
            if (!response.ok || !response.body) {
                throw new Error(`APK download failed: ${response.status} ${await response.text().catch(() => "")}`.trim());
            }
            job.bytesTotal = Number(response.headers.get("content-length")) || 0;
            await pipeline(
                Readable.fromWeb(response.body as NodeReadableStream),
                async function* (source: AsyncIterable<Buffer>) {
                    for await (const chunk of source) {
                        job.bytesDone += chunk.length;
                        yield chunk;
                    }
                },
                createWriteStream(apk),
            );

            job.stage = "Extracting";
            const bundle = await readZipEntry(apk, BUNDLE_ENTRY);

            job.stage = "Saving";
            const build: AndroidBuild = {
                ...release,
                channels: [channel],
                firstSeen: Date.now(),
                bundleSize: bundle.length,
                bundleSha256: createHash("sha256").update(bundle).digest("hex"),
                hermesVersion: hermesVersion(bundle),
            };
            await writeAndroidBuild(build, bundle);
            this.builds.set(versionCode, build);
            this.failures.delete(versionCode);

            const seconds = ((Date.now() - job.startedAt) / 1000).toFixed(1);
            console.log(`[android] saved ${channel} ${release.version} (${versionCode}) in ${seconds}s`);
            if (build.hermesVersion != null) this.queueDecompile(versionCode);
        } catch (error) {
            const failure = nextFailure(this.failures.get(versionCode), error);
            this.failures.set(versionCode, failure);
            console.error(
                `[android] failed to download ${channel} ${versionCode} ` +
                `(attempt ${failure.count}), retrying in ${Math.round((failure.retryAt - Date.now()) / 1000)}s:`,
                error,
            );
        } finally {
            this.jobs.delete(versionCode);
            if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
        }
    }

    private queueDecompile(versionCode: number) {
        this.decompileQueue = this.decompileQueue.then(() => this.decompile(versionCode));
    }

    private async decompile(versionCode: number) {
        const job: AndroidJob = { versionCode, channel: this.builds.get(versionCode)!.channels[0], startedAt: Date.now(), stage: "Decompiling", bytesDone: 0, bytesTotal: 0 };
        this.jobs.set(versionCode, job);
        let workDir: string | null = null;
        try {
            workDir = await fs.mkdtemp(path.join(os.tmpdir(), `dbd-android-${versionCode}-`));
            const bundle = path.join(workDir, "index.android.bundle");
            const decompiled = path.join(workDir, "decompiled.js");
            await pipeline(
                createReadStream(path.join(androidBuildPath(versionCode), ANDROID_BUNDLE_FILE_NAME)),
                zlib.createZstdDecompress(),
                createWriteStream(bundle),
            );
            await decompileHermes(bundle, decompiled);

            job.stage = "Splitting modules";
            const data = await splitModules(decompiled);
            const modules = Object.keys(data.modules).length;
            if (!modules) throw new Error("found no modules in the decompiled bundle");

            job.stage = "Saving";
            await writeAndroidData(this.builds.get(versionCode)!, data);
            // read the build again, it can gain a channel while this runs
            const build = { ...this.builds.get(versionCode)!, modules };
            await writeAndroidMeta(build);
            this.builds.set(versionCode, build);

            const seconds = ((Date.now() - job.startedAt) / 1000).toFixed(1);
            console.log(`[android] decompiled ${versionCode} into ${modules} modules in ${seconds}s`);
        } catch (error) {
            console.error(`[android] failed to decompile ${versionCode}, will retry on the next start:`, error);
        } finally {
            this.jobs.delete(versionCode);
            if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
        }
    }

    private addChannel(build: AndroidBuild, channel: AndroidChannel) {
        const updated = { ...build, channels: ANDROID_CHANNELS.filter(c => c === channel || build.channels.includes(c)) };
        this.builds.set(build.versionCode, updated);
        console.log(`[android] ${build.versionCode} is now on ${updated.channels.join(" and ")}`);
        this.queue = this.queue.then(() => writeAndroidMeta(this.builds.get(build.versionCode)!).catch(error => {
            console.error(`[android] failed to save ${channel} on ${build.versionCode}:`, error);
        }));
    }
}
