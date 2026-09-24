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
const MAX_RETRY_MS = 60 * 60 * 1000;

export class Tracker {
    readonly status = {} as Record<Channel, ChannelStatus>;
    readonly jobs = new Map<string, ScrapeJob>();
    readonly failures = new Map<string, Failure>();
    private scrapeQueue = Promise.resolve();
    private checking = false;
    private timer: NodeJS.Timeout | null = null;

    constructor(private readonly index: BuildIndex) {
        for (const channel of Config.channels) {
            this.status[channel] = { buildHash: null, checkedAt: null, error: null };
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
            await Promise.all(Config.channels.map(c => this.checkChannel(c)));
        } finally {
            this.checking = false;
        }
    }

    private async checkChannel(channel: Channel) {
        const status = this.status[channel];
        let res: Response;
        try {
            res = await fetch(`${APP_ORIGINS[channel]}/app`, { headers: { "User-Agent": Config.userAgent } });
        } catch (e) {
            status.error = `Failed to reach Discord: ${e}`;
            return;
        }
        status.checkedAt = Date.now();

        const buildHash = res.headers.get("x-build-id");
        if (!res.ok || !buildHash) {
            status.error = res.ok ? "No x-build-id header" : `${res.status} ${res.statusText}`;
            await res.body?.cancel();
            return;
        }
        status.error = null;
        if (status.buildHash !== buildHash) {
            console.log(`[tracker] ${channel} is on ${buildHash}`);
            status.buildHash = buildHash;
        }

        const known = this.index.get(buildHash);
        const failure = this.failures.get(buildHash);
        if (known || this.jobs.has(buildHash) || (failure && failure.retryAt > Date.now())) {
            await res.body?.cancel();
            if (known && !channelsOf(known).includes(channel)) this.addChannel(known, channel);
            return;
        }

        const html = await res.text();
        const job: ScrapeJob = { buildHash, channel, startedAt: Date.now(), progress: null };
        this.jobs.set(buildHash, job);
        this.scrapeQueue = this.scrapeQueue.then(() => this.scrape(job, html));
    }

    private async scrape(job: ScrapeJob, html: string) {
        const { buildHash, channel } = job;
        job.startedAt = Date.now();
        try {
            const bundle = await scrapeFullBundle({
                channel,
                buildHash,
                html,
                onProgress: p => void (job.progress = p),
            });
            job.progress = { stage: "Saving", chunksDone: 0, chunksTotal: 0 };
            await writeFullBundle(bundle);
            this.index.add(bundle.metadata);
            this.failures.delete(buildHash);
            console.log(`[tracker] saved ${channel} build ${bundle.metadata.buildNumber} (${buildHash}) in ${((Date.now() - job.startedAt) / 1000).toFixed(1)}s`);
            getArchive(buildHash).catch(e => console.error(`[tracker] failed to prebuild ${buildHash}.7z:`, e));
        } catch (e) {
            const count = (this.failures.get(buildHash)?.count ?? 0) + 1;
            const delay = Math.min(MIN_RETRY_MS * 2 ** (count - 1), MAX_RETRY_MS);
            this.failures.set(buildHash, { count, retryAt: Date.now() + delay, error: String(e) });
            console.error(`[tracker] failed to scrape ${channel} build ${buildHash} (attempt ${count}), retrying in ${delay / 1000}s:`, e);
        } finally {
            this.jobs.delete(buildHash);
        }
    }

    private addChannel(meta: BundleMetadata, channel: Channel) {
        const updated = withChannels({ ...meta, channels: [...channelsOf(meta), channel] });
        console.log(`[tracker] ${meta.buildHash} is now on ${channelsOf(updated).join(" and ")}`);
        this.index.add(updated);
        this.scrapeQueue = this.scrapeQueue.then(async () => {
            try {
                const bundle = await readFullBundle(meta.buildHash);
                await writeFullBundle({ ...bundle, metadata: updated });
                await invalidateArchive(meta.buildHash);
            } catch (e) {
                console.error(`[tracker] failed to save ${channel} on ${meta.buildHash}:`, e);
            }
        });
    }
}
