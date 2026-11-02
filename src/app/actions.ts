"use server";

import { type AndroidBuild, isAndroidChannel } from "@/lib/android/types";
import { getAndroidBuilds, getIndex } from "@/lib/services";
import { type BundleMetadata, isChannel, PAGE_SIZE } from "@/lib/types";

export async function loadBuilds(channel: string | undefined, before: number): Promise<BundleMetadata[]> {
    if (!Number.isFinite(before)) return [];
    const index = await getIndex();
    return index.list(isChannel(channel) ? channel : undefined)
        .filter(b => b.firstSeen < before)
        .slice(-PAGE_SIZE)
        .toReversed();
}

export async function loadAndroidBuilds(channel: string | undefined, before: number): Promise<AndroidBuild[]> {
    if (!Number.isFinite(before)) return [];
    const builds = await getAndroidBuilds();
    return builds
        .filter(b => b.versionCode < before && (!isAndroidChannel(channel) || b.channels.includes(channel)))
        .slice(-PAGE_SIZE)
        .toReversed();
}
