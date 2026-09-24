export type Channel = "stable" | "canary";

export const CHANNELS: readonly Channel[] = ["stable", "canary"];

export interface BundleMetadata {
    buildHash: string;
    buildNumber: number;
    firstSeen: number;
    entryPoint: number | null;
    channels?: Channel[];
}

export interface ModuleDeps {
    sync: number[];
    lazy: number[];
}

export interface DepInfo {
    keyModules: { fluxDispatcherClass: [number, string][]; };
    moduleDeps: Record<string, ModuleDeps>;
}

export interface FullBundle {
    metadata: BundleMetadata;
    depInfo: DepInfo;
    moduleSources: Record<string, number[]>;
    modules: Record<string, string>;
    envVarText: string;
}

export function isChannel(value: unknown): value is Channel {
    return CHANNELS.includes(value as Channel);
}

export function channelsOf(meta: BundleMetadata): Channel[] {
    const channels = meta.channels?.length ? meta.channels : ["stable"];
    return CHANNELS.filter(c => channels.includes(c));
}

export function withChannels(meta: BundleMetadata): BundleMetadata {
    return { ...meta, channels: channelsOf(meta) };
}

export function channelLabel(meta: BundleMetadata): string {
    return channelsOf(meta).join("-");
}
