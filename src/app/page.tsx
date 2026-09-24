import Link from "next/link";
import { connection } from "next/server";

import { AutoRefresh } from "@/components/AutoRefresh";
import { ChannelBadge } from "@/components/ChannelBadge";
import { Config } from "@/lib/config";
import { formatDate, shortHash, timeAgo } from "@/lib/format";
import { getIndex, getTracker } from "@/lib/services";
import { type Channel, channelsOf } from "@/lib/types";

const FILTERS: { label: string; value?: Channel; }[] = [
    { label: "All" },
    { label: "Stable", value: "stable" },
    { label: "Canary", value: "canary" },
];

export default async function Home({ searchParams }: PageProps<"/">) {
    await connection();
    const { channel: rawChannel } = await searchParams;
    const channel = rawChannel === "stable" || rawChannel === "canary" ? rawChannel : undefined;

    const index = await getIndex();
    const tracker = getTracker();
    const builds = index.list(channel).toReversed();
    const jobs = tracker ? [...tracker.jobs.values()] : [];
    const failures = tracker ? [...tracker.failures.entries()] : [];

    return (
        <div className="space-y-8">
            <AutoRefresh intervalMs={jobs.length ? 2000 : 30_000} />

            <section>
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">Tracker</h2>
                {tracker ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {Config.channels.map(c => {
                            const status = tracker.status[c];
                            const known = status.buildHash ? index.get(status.buildHash) : undefined;
                            return (
                                <div key={c} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                                    <div className="flex items-center justify-between">
                                        <ChannelBadge channel={c} />
                                        <span className="text-xs text-zinc-500">
                                            {status.checkedAt ? `checked ${timeAgo(status.checkedAt)}` : "not checked yet"}
                                        </span>
                                    </div>
                                    <div className="mt-3 font-mono text-sm">
                                        {status.buildHash
                                            ? known
                                                ? <Link href={`/build/${status.buildHash}`}>{status.buildHash}</Link>
                                                : <span className="text-zinc-300">{status.buildHash}</span>
                                            : <span className="text-zinc-500">—</span>}
                                    </div>
                                    {known && <div className="mt-1 text-sm text-zinc-400">Build {known.buildNumber}</div>}
                                    {status.error && <div className="mt-2 text-sm text-red-400">{status.error}</div>}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-zinc-500">
                        The tracker isn't running{Config.trackerEnabled ? " yet" : " (TRACKER_ENABLED=false)"}.
                        Existing builds are still served.
                    </p>
                )}

                {jobs.map(job => {
                    const p = job.progress;
                    const pct = p?.chunksTotal ? Math.round((p.chunksDone / p.chunksTotal) * 100) : null;
                    return (
                        <div key={job.buildHash} className="mt-3 rounded-lg border border-indigo-900 bg-indigo-950/40 p-4">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-medium text-indigo-200">Scraping</span>
                                <ChannelBadge channel={job.channel} />
                                <span className="font-mono text-zinc-300">{shortHash(job.buildHash)}</span>
                                <span className="text-zinc-400">{p?.stage ?? "Queued"}</span>
                                {p?.chunksTotal ? <span className="text-zinc-500">{p.chunksDone}/{p.chunksTotal} chunks</span> : null}
                            </div>
                            {pct != null && (
                                <div className="mt-3 h-1.5 overflow-hidden rounded bg-zinc-800">
                                    <div className="h-full bg-indigo-400 transition-[width]" style={{ width: `${pct}%` }} />
                                </div>
                            )}
                        </div>
                    );
                })}

                {failures.map(([hash, f]) => (
                    <div key={hash} className="mt-3 rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm">
                        <span className="font-mono text-zinc-300">{shortHash(hash)}</span>
                        <span className="text-red-300"> failed {f.count}×, retrying {timeAgo(f.retryAt)}</span>
                        <div className="mt-1 font-mono text-xs break-all text-red-400/80">{f.error}</div>
                    </div>
                ))}
            </section>

            <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
                        Builds <span className="text-zinc-600">({builds.length})</span>
                    </h2>
                    <div className="flex gap-1 text-sm">
                        {FILTERS.map(f => (
                            <Link
                                key={f.label}
                                href={f.value ? `/?channel=${f.value}` : "/"}
                                className={`rounded px-2.5 py-1 hover:no-underline ${channel === f.value
                                    ? "bg-zinc-800 text-zinc-100"
                                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
                            >
                                {f.label}
                            </Link>
                        ))}
                    </div>
                </div>

                {builds.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
                        No builds yet. The tracker saves one as soon as it sees a build it doesn't have.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                        <table className="w-full text-sm">
                            <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Build</th>
                                    <th className="px-3 py-2 font-medium">Hash</th>
                                    <th className="px-3 py-2 font-medium">Channel</th>
                                    <th className="px-3 py-2 font-medium">First seen</th>
                                    <th className="px-3 py-2 text-right font-medium">Download</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/70">
                                {builds.map(b => (
                                    <tr key={b.buildHash} className="hover:bg-zinc-900/60">
                                        <td className="px-3 py-2 tabular-nums">
                                            <Link href={`/build/${b.buildHash}`}>{b.buildNumber || "?"}</Link>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-zinc-300">{shortHash(b.buildHash)}</td>
                                        <td className="space-x-1 px-3 py-2">
                                            {channelsOf(b).map(c => <ChannelBadge key={c} channel={c} />)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-zinc-400" title={formatDate(b.firstSeen)}>
                                            {timeAgo(b.firstSeen)}
                                        </td>
                                        <td className="space-x-3 px-3 py-2 text-right whitespace-nowrap">
                                            <a href={`/build/archive/${b.buildHash}.7z`}>.7z</a>
                                            <a href={`/build/${b.buildHash}/full`}>.mpk.zst</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
