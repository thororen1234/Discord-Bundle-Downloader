export type AndroidChannel = "alpha" | "beta" | "stable";

export const ANDROID_CHANNELS: readonly AndroidChannel[] = ["alpha", "beta", "stable"];

export interface AndroidRelease {
    versionCode: number;
    version: string;
    versionName: string | null;
    releasedAt: string | null;
}

export interface AndroidBuild extends AndroidRelease {
    channels: AndroidChannel[];
    firstSeen: number;
    bundleSize: number;
    bundleSha256: string;
    hermesVersion: number | null;
}

export function isAndroidChannel(value: unknown): value is AndroidChannel {
    return ANDROID_CHANNELS.includes(value as AndroidChannel);
}

export function parseAndroidRelease(value: unknown): AndroidRelease | null {
    if (typeof value !== "object" || value == null) return null;
    const { versionCode, version, versionName, releasedAt } = value as Record<string, unknown>;
    if (!Number.isSafeInteger(versionCode) || (versionCode as number) <= 0 || typeof version !== "string") return null;
    return {
        versionCode: versionCode as number,
        version,
        versionName: typeof versionName === "string" ? versionName : null,
        releasedAt: typeof releasedAt === "string" ? releasedAt : null,
    };
}
