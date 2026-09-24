export type Channel = "stable" | "canary";

export type ModuleId = string;

export interface BundleMetadata {
    buildHash: string;
    buildNumber: number;
    firstSeen: number;
    entryPoint: number | null;
    channels?: Channel[];
}

export interface IncomingModuleDeps {
    sync: number[];
    lazy: number[];
}

export interface DepInfo {
    keyModules: { fluxDispatcherClass: [number, string][]; };
    moduleDeps: Record<ModuleId, IncomingModuleDeps>;
}

export interface FullBundle {
    metadata: BundleMetadata;
    depInfo: DepInfo;
    moduleSources: Record<string, number[]>;
    modules: Record<ModuleId, string>;
    envVarText: string;
}

export interface TimestampQueryResults {
    before: BundleMetadata | null;
    after: BundleMetadata | null;
}

const CHANNEL_ORDER: Channel[] = ["stable", "canary"];

export function channelsOf(meta: BundleMetadata): Channel[] {
    const channels = meta.channels?.length ? meta.channels : ["stable"];
    return CHANNEL_ORDER.filter(c => channels.includes(c));
}

export function withChannels(meta: BundleMetadata): BundleMetadata {
    return { ...meta, channels: channelsOf(meta) };
}

export function channelLabel(meta: BundleMetadata): string {
    return channelsOf(meta).join("-");
}
