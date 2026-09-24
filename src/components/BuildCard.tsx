import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { formatDate } from "@/lib/format";
import { type BundleMetadata, channelsOf } from "@/lib/types";
import { cardClass } from "@/lib/ui";

import { ChannelBadge, LatestBadge } from "./ChannelBadge";

export function BuildCard({ build, latest }: { build: BundleMetadata; latest: boolean; }) {
    return (
        <Link href={`/build/${build.buildHash}`} prefetch={false} className={cardClass}>
            <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-neutral-800 tabular-nums dark:text-neutral-200">
                    {build.buildNumber || "?"}
                </span>
                {channelsOf(build).map(c => <ChannelBadge key={c} channel={c} />)}
                {latest && <LatestBadge />}
                <ArrowRight
                    size={16}
                    className="ml-auto shrink-0 text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-rose-500"
                />
            </div>
            <span className="text-sm text-neutral-600 tabular-nums dark:text-neutral-400">{formatDate(build.firstSeen)}</span>
            <span className="truncate font-mono text-xs text-neutral-500" title={build.buildHash}>
                {build.buildHash}
            </span>
        </Link>
    );
}
