import { Download } from "lucide-react";

import type { AndroidBuild } from "@/lib/android/types";
import { formatBytes, formatDate } from "@/lib/format";

import { ChannelBadge, LatestBadge } from "./ChannelBadge";

export function AndroidBuildCard({ build, latest }: { build: AndroidBuild; latest: boolean; }) {
    return (
        <a
            href={`/android/${build.versionCode}/bundle`}
            download
            className="group flex h-full flex-col gap-1.5 rounded-2xl border border-zinc-300 bg-zinc-100 px-5 py-4 text-neutral-800 transition-colors hover:border-zinc-400 hover:no-underline dark:border-zinc-800 dark:bg-zinc-900 dark:text-neutral-300 dark:hover:border-zinc-700"
        >
            <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-neutral-800 tabular-nums dark:text-neutral-200">
                    {build.version}
                </span>
                {build.channels.map(c => <ChannelBadge key={c} channel={c} />)}
                {latest && <LatestBadge />}
                <Download
                    size={16}
                    className="ml-auto shrink-0 text-neutral-500 transition-transform group-hover:translate-y-0.5 group-hover:text-rose-500"
                />
            </div>
            <span className="text-sm text-neutral-600 tabular-nums dark:text-neutral-400">{formatDate(build.firstSeen)}</span>
            <span className="font-mono text-xs text-neutral-500">
                {build.versionCode} · {formatBytes(build.bundleSize)}
                {build.hermesVersion != null && ` · Hermes v${build.hermesVersion}`}
            </span>
        </a>
    );
}
