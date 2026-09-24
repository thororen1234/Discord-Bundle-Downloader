import { getArchive, invalidateArchive } from "./archive";
import type { BuildIndex } from "./buildIndex";
import { APP_ORIGINS, Config } from "./config";
import { scrapeFullBundle, type ScrapeProgress } from "./scraper";
import { readFullBundle, writeFullBundle } from "./storage";
import { type BundleMetadata, type Channel, channelsOf, withChannels } from "./types";

export interface ChannelStatus {
    buildHash: string | null;
    checkedAt: number | null;
    error: string | null;
}

export interface ScrapeJob {
    buildHash: string;
    channel: Channel;
    startedAt: number;
    progress: ScrapeProgress | null;
}

interface Failure {
    count: number;
    retryAt: number;
    error: string;
}

const MIN_RETRY_MS = 60 * 1000;
const MAX_RETRY_MS = 60 * MIN_RETRY_MS;

export class Tracker {
    readonly status = {} as Record<Channel, ChannelStatus>;
    readonly jobs = new Map<string, ScrapeJob>();
    readonly failures = new Map<string, Failure>();

    private queue = Promise.resolve();
    private checking = false;
    private timer: NodeJS.Timeout | null = null;

    constructor(private readonly index: BuildIndex) {
        for (const channel of Config.channels) {
            this.status[channel] = {
                buildHash: null,
                checkedAt: null,
                error: null,
            };
        }
    }

    start() {
        if (this.timer) return;
        console.log(`[tracker] watching ${Config.channels.join(", ")} every ${Config.pollIntervalMs / 1000}s`);
        void this.check();
        this.timer = setInterval(() => void this.check(), Config.pollIntervalMs);
        this.timer.unref();
    }

    async check() {
        if (this.checking) return;
        this.checking = true;
        try {
            await Promise.all(Config.channels.map(channel => this.checkChannel(channel)));
        } finally {
            this.checking = false;
        }
    }

    private async checkChannel(channel: Channel) {
        const status = this.status[channel];
        let response: Response;
        try {
            response = await fetch(`${APP_ORIGINS[channel]}/app`, { headers: { "User-Agent": Config.userAgent } });
        } catch (error) {
            status.error = `Failed to reach Discord: ${error}`;
            return;
        }
        status.checkedAt = Date.now();

        const buildHash = response.headers.get("x-build-id");
        if (!response.ok || !buildHash) {
            status.error = response.ok ? "No x-build-id header" : `${response.status} ${response.statusText}`;
            await response.body?.cancel();
            return;
        }
        status.error = null;
        if (status.buildHash !== buildHash) {
            status.buildHash = buildHash;
            console.log(`[tracker] ${channel} is on ${buildHash}`);
        }

        const metadata = this.index.get(buildHash);
        if (metadata) {
            await response.body?.cancel();
            if (!channelsOf(metadata).includes(channel)) this.addChannel(metadata, channel);
            return;
        }

        if (this.jobs.has(buildHash)) {
            await response.body?.cancel();
            return;
        }

        const failure = this.failures.get(buildHash);
        if (failure?.retryAt && failure.retryAt > Date.now()) {
            await response.body?.cancel();
            return;
        }

        const html = await response.text();
        const job: ScrapeJob = { buildHash, channel, startedAt: Date.now(), progress: null };
        this.jobs.set(buildHash, job);
        this.queue = this.queue.then(() => this.scrape(job, html));
    }

    private async scrape(job: ScrapeJob, html: string) {
        const { buildHash, channel } = job;
        job.startedAt = Date.now();
        try {
            const bundle = await scrapeFullBundle({
                channel,
                buildHash,
                html,
                onProgress: progress => void (job.progress = progress),
            });
            job.progress = { stage: "Saving", chunksDone: 0, chunksTotal: 0 };
            await writeFullBundle(bundle);
            this.index.add(bundle.metadata);
            this.failures.delete(buildHash);

            const seconds = ((Date.now() - job.startedAt) / 1000).toFixed(1);
            console.log(`[tracker] saved ${channel} build ${bundle.metadata.buildNumber} (${buildHash}) in ${seconds}s`);
            void getArchive(buildHash).catch(error => {
                console.error(`[tracker] failed to prebuild ${buildHash}.7z:`, error);
            });
        } catch (error) {
            this.recordFailure(buildHash, channel, error);
        } finally {
            this.jobs.delete(buildHash);
        }
    }

    private recordFailure(buildHash: string, channel: Channel, error: unknown) {
        const count = (this.failures.get(buildHash)?.count ?? 0) + 1;
        const delay = Math.min(
            MIN_RETRY_MS * 2 ** (count - 1),
            MAX_RETRY_MS,
        );
        this.failures.set(buildHash, { count, retryAt: Date.now() + delay, error: String(error) });
        console.error(
            `[tracker] failed to scrape ${channel} build ${buildHash} ` +
            `(attempt ${count}), retrying in ${delay / 1000}s:`,
            error,
        );
    }

    private addChannel(metadata: BundleMetadata, channel: Channel) {
        const updated = withChannels({
            ...metadata,
            channels: [...channelsOf(metadata), channel],
        });
        console.log(`[tracker] ${metadata.buildHash} is now on ${channelsOf(updated).join(" and ")}`);
        this.index.add(updated);
        this.queue = this.queue.then(async () => {
            try {
                const bundle = await readFullBundle(metadata.buildHash);
                await writeFullBundle({ ...bundle, metadata: updated });
                await invalidateArchive(metadata.buildHash);
            } catch (error) {
                console.error(`[tracker] failed to save ${channel} on ${metadata.buildHash}:`, error);
            }
        });
    }
}
