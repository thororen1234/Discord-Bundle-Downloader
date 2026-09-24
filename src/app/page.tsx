import { Activity, LoaderCircle, Package, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { AutoRefresh } from "@/components/AutoRefresh";
import { BuildCard } from "@/components/BuildCard";
import { ChannelBadge } from "@/components/ChannelBadge";
import { Section } from "@/components/Section";
import { Config } from "@/lib/config";
import { shortHash, timeAgo } from "@/lib/format";
import { getIndex, getTracker } from "@/lib/services";
import { type Channel, channelsOf } from "@/lib/types";
import { boxClass, buttonClass, mutedTextClass, tabClass, tabGroupClass } from "@/lib/ui";

const INITIAL_COUNT = 24;

const FILTERS: { label: string; value?: Channel; }[] = [
    { label: "All" },
    { label: "Stable", value: "stable" },
    { label: "Canary", value: "canary" },
];

function filterHref(channel: Channel | undefined, all: boolean) {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    if (all) params.set("all", "1");
    const query = params.toString();
    return query ? `/?${query}` : "/";
}

export default async function Home({ searchParams }: PageProps<"/">) {
    await connection();
    const { channel: rawChannel, all } = await searchParams;
    const channel = rawChannel === "stable" || rawChannel === "canary" ? rawChannel : undefined;
    const showAll = all === "1";

    const index = await getIndex();
    const tracker = getTracker();
    const builds = index.list(channel).toReversed();
    const visible = showAll ? builds : builds.slice(0, INITIAL_COUNT);
    const jobs = tracker ? [...tracker.jobs.values()] : [];
    const failures = tracker ? [...tracker.failures.entries()] : [];

    const latest = new Set<string>();
    const seen = new Set<Channel>();
    for (const build of index.list().toReversed()) {
        for (const c of channelsOf(build)) {
            if (seen.has(c)) continue;
            seen.add(c);
            latest.add(build.buildHash);
        }
    }

    return (
        <>
            <AutoRefresh intervalMs={jobs.length ? 2000 : 30_000} />

            <Section icon={Activity} title="Tracker">
                {tracker ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {Config.channels.map(c => {
                            const status = tracker.status[c];
                            const known = status.buildHash ? index.get(status.buildHash) : undefined;
                            return (
                                <div key={c} className={`flex flex-col gap-1.5 px-5 py-4 ${boxClass}`}>
                                    <div className="flex items-center gap-2">
                                        <ChannelBadge channel={c} />
                                        <span className="ml-auto text-xs text-neutral-500">
                                            {status.checkedAt ? `checked ${timeAgo(status.checkedAt)}` : "not checked yet"}
                                        </span>
                                    </div>
                                    <span className="text-lg font-semibold text-neutral-800 tabular-nums dark:text-neutral-200">
                                        {known ? known.buildNumber : "—"}
                                    </span>
                                    <span className="truncate font-mono text-xs text-neutral-500">
                                        {status.buildHash && known
                                            ? <Link href={`/build/${status.buildHash}`}>{status.buildHash}</Link>
                                            : status.buildHash ?? "waiting for first check"}
                                    </span>
                                    {status.error && <span className="text-sm text-rose-500">{status.error}</span>}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className={mutedTextClass}>
                        The tracker isn&apos;t running{Config.trackerEnabled ? " yet" : " (TRACKER_ENABLED=false)"}.
                        Stored builds are still served.
                    </p>
                )}

                {jobs.map(job => {
                    const p = job.progress;
                    const pct = p?.chunksTotal ? Math.round((p.chunksDone / p.chunksTotal) * 100) : null;
                    return (
                        <div key={job.buildHash} className={`flex flex-col gap-2 px-5 py-4 ${boxClass}`}>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <LoaderCircle size={16} className="animate-spin text-rose-500" />
                                <span className="font-medium">Scraping</span>
                                <ChannelBadge channel={job.channel} />
                                <span className="font-mono text-xs text-neutral-500">{shortHash(job.buildHash)}</span>
                                <span className={mutedTextClass}>{p?.stage ?? "Queued"}</span>
                                {p?.chunksTotal ? <span className={`ml-auto tabular-nums ${mutedTextClass}`}>{p.chunksDone}/{p.chunksTotal} chunks</span> : null}
                            </div>
                            {pct != null && (
                                <div className="h-2 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-800">
                                    <div className="h-full bg-rose-500 transition-[width]" style={{ width: `${pct}%` }} />
                                </div>
                            )}
                        </div>
                    );
                })}

                {failures.map(([hash, f]) => (
                    <div key={hash} className={`flex flex-col gap-1 px-5 py-4 ${boxClass}`}>
                        <div className="flex items-center gap-2 text-sm text-rose-500">
                            <TriangleAlert size={16} />
                            <span className="font-mono text-xs">{shortHash(hash)}</span>
                            failed {f.count}×, retrying {timeAgo(f.retryAt)}
                        </div>
                        <span className="font-mono text-xs break-all text-neutral-500">{f.error}</span>
                    </div>
                ))}
            </Section>

            <Section icon={Package} title="Builds" badge={<span className="text-neutral-500">({builds.length})</span>}>
                <div className={tabGroupClass} role="group" aria-label="Release channel">
                    {FILTERS.map(f => (
                        <Link
                            key={f.label}
                            href={filterHref(f.value, showAll)}
                            aria-current={channel === f.value ? "page" : undefined}
                            className={tabClass(channel === f.value)}
                        >
                            {f.label}
                        </Link>
                    ))}
                </div>

                {builds.length === 0 ? (
                    <p className={mutedTextClass}>
                        No {channel ?? ""} builds yet. The tracker saves one as soon as it sees a build it doesn&apos;t have.
                    </p>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visible.map(b => (
                            <li key={b.buildHash}>
                                <BuildCard build={b} latest={latest.has(b.buildHash)} />
                            </li>
                        ))}
                    </ul>
                )}

                {!showAll && builds.length > INITIAL_COUNT && (
                    <Link href={filterHref(channel, true)} className={`self-center ${buttonClass}`}>
                        Show all {builds.length} builds
                    </Link>
                )}
            </Section>
        </>
    );
}
