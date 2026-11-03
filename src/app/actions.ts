"use server";

import { type AndroidBuild, isAndroidChannel } from "@/lib/android/types";
import { inRange, parseDateFilter } from "@/lib/dateFilter";
import { getAndroidBuilds, getIndex } from "@/lib/services";
import { type BundleMetadata, isChannel, PAGE_SIZE } from "@/lib/types";

export async function loadBuilds(channel: string | undefined, before: number, date?: string): Promise<BundleMetadata[]> {
    if (!Number.isFinite(before)) return [];
    const range = parseDateFilter(date);
    const index = await getIndex();
    return index.list(isChannel(channel) ? channel : undefined)
        .filter(b => b.firstSeen < before && inRange(range, b.firstSeen))
        .slice(-PAGE_SIZE)
        .toReversed();
}

export async function loadAndroidBuilds(channel: string | undefined, before: number, date?: string): Promise<AndroidBuild[]> {
    if (!Number.isFinite(before)) return [];
    const range = parseDateFilter(date);
    const builds = await getAndroidBuilds();
    return builds
        .filter(b => b.versionCode < before && inRange(range, b.firstSeen) && (!isAndroidChannel(channel) || b.channels.includes(channel)))
        .slice(-PAGE_SIZE)
        .toReversed();
}
