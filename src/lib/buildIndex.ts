import fs from "fs/promises";
import path from "path";

import { buildsRoot, exists, METADATA_FILE_NAME, readMetadata } from "./storage";
import { type BundleMetadata, type Channel, channelsOf, withChannels } from "./types";

export class BuildIndex {
    private byHash = new Map<string, BundleMetadata>();
    private byTime: BundleMetadata[] = [];

    async populateFromDisk(): Promise<void> {
        const entries = await fs.readdir(buildsRoot(), { withFileTypes: true });
        const metas = await Promise.all(entries.map(async entry => {
            if (!entry.isDirectory()) return null;
            if (!await exists(path.join(buildsRoot(), entry.name, METADATA_FILE_NAME))) return null;
            try {
                return withChannels(await readMetadata(entry.name));
            } catch (e) {
                console.warn(`[index] skipping build ${entry.name}, metadata is unreadable:`, e);
                return null;
            }
        }));

        this.byHash = new Map(metas.filter(m => m != null).map(m => [m.buildHash, m]));
        this.sort();
        console.log(`[index] loaded ${this.byHash.size} builds`);
    }

    private sort() {
        this.byTime = [...this.byHash.values()].sort((a, b) => a.firstSeen - b.firstSeen);
    }

    add(meta: BundleMetadata) {
        meta = withChannels(meta);
        this.byHash.set(meta.buildHash, meta);
        this.sort();
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
