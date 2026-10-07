import fs from "fs/promises";
import path from "path";

import { buildsRoot, METADATA_FILE_NAME, readMetadata } from "./storage";
import { type BundleMetadata, type Channel, channelsOf, withChannels } from "./types";

export class BuildIndex {
    private byHash = new Map<string, BundleMetadata>();
    private byTime: BundleMetadata[] = [];
    private mtimes = new Map<string, number>();
    private loaded = false;

    async refresh(): Promise<void> {
        const entries = await fs.readdir(buildsRoot(), { withFileTypes: true });
        const next = new Map<string, BundleMetadata>();
        const mtimes = new Map<string, number>();
        await Promise.all(entries.map(async entry => {
            if (!entry.isDirectory()) return;
            const stat = await fs.stat(path.join(buildsRoot(), entry.name, METADATA_FILE_NAME)).catch(() => null);
            if (!stat) return;

            const known = this.byHash.get(entry.name);
            if (known && this.mtimes.get(entry.name) === stat.mtimeMs) {
                next.set(entry.name, known);
                mtimes.set(entry.name, stat.mtimeMs);
                return;
            }
            try {
                next.set(entry.name, withChannels(await readMetadata(entry.name)));
                mtimes.set(entry.name, stat.mtimeMs);
            } catch (e) {
                console.warn(`[index] skipping build ${entry.name}, metadata is unreadable:`, e);
            }
        }));

        const changed = next.size !== this.byHash.size || [...next].some(([hash, meta]) => this.byHash.get(hash) !== meta);
        this.byHash = next;
        this.mtimes = mtimes;
        if (!changed && this.loaded) return;
        this.rebuildTimeIndex();
        console.log(`[index] loaded ${this.byHash.size} builds`);
        this.loaded = true;
    }

    private rebuildTimeIndex() {
        this.byTime = [...this.byHash.values()].sort((a, b) => a.firstSeen - b.firstSeen);
    }

    add(meta: BundleMetadata) {
        meta = withChannels(meta);
        this.byHash.set(meta.buildHash, meta);
        this.rebuildTimeIndex();
    }

    get(buildHash: string): BundleMetadata | undefined {
        return this.byHash.get(buildHash);
    }

    get size() {
        return this.byHash.size;
    }

    list(channel?: Channel): BundleMetadata[] {
        return channel ? this.byTime.filter(m => channelsOf(m).includes(channel)) : this.byTime;
    }

    latest(channel?: Channel): BundleMetadata | null {
        return this.list(channel).at(-1) ?? null;
    }

    before(time: number, channel?: Channel): BundleMetadata | null {
        return this.list(channel).findLast(m => m.firstSeen < time) ?? null;
    }

    after(time: number, channel?: Channel): BundleMetadata | null {
        return this.list(channel).find(m => m.firstSeen > time) ?? null;
    }
}
