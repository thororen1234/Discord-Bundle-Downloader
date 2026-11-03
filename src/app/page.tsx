import { Activity, LoaderCircle, Monitor, Package, Smartphone, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { AutoRefresh } from "@/components/AutoRefresh";
import { AndroidBuildGrid, BuildGrid } from "@/components/BuildGrid";
import { ChannelBadge } from "@/components/ChannelBadge";
import { DatePicker } from "@/components/DatePicker";
import { Section } from "@/components/Section";
import { ANDROID_CHANNELS, type AndroidChannel, isAndroidChannel } from "@/lib/android/types";
import { countByDay, type DateRange, formatDateFilter, inRange, parseDateFilter } from "@/lib/dateFilter";
import { formatBytes, shortHash, timeAgo } from "@/lib/format";
import { getAndroidBuilds, getIndex } from "@/lib/services";
import { readTrackerStatus } from "@/lib/trackerStatus";
import { type Channel, channelsOf, isChannel, PAGE_SIZE } from "@/lib/types";

const boxClass = "rounded-2xl border border-zinc-300 bg-zinc-100 text-neutral-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-neutral-300";
const mutedTextClass = "text-sm text-neutral-500 dark:text-neutral-400";

type Platform = "desktop" | "mobile";

const PLATFORMS: { label: string; value: Platform; icon: typeof Monitor; }[] = [
    { label: "Desktop", value: "desktop", icon: Monitor },
    { label: "Mobile", value: "mobile", icon: Smartphone },
];

const FILTERS: { label: string; value?: Channel; }[] = [
    { label: "All" },
    { label: "Stable", value: "stable" },
    { label: "PTB", value: "ptb" },
    { label: "Canary", value: "canary" },
];

const ANDROID_FILTERS: { label: string; value?: AndroidChannel; }[] = [
    { label: "All" },
    { label: "Alpha", value: "alpha" },
    { label: "Beta", value: "beta" },
    { label: "Stable", value: "stable" },
];

function filterHref(platform: Platform, channel: string | undefined, date?: DateRange | null) {
    const params = new URLSearchParams();
    if (platform === "mobile") params.set("platform", platform);
    if (channel) params.set("channel", channel);
    if (date) params.set("date", date.value);
    const query = params.toString();
    return query ? `/?${query}` : "/";
}

function tabClass(active: boolean) {
    const color = active
        ? "bg-zinc-100 text-neutral-900 shadow-sm dark:bg-zinc-700 dark:text-neutral-100"
        : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";
    return `flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:no-underline ${color}`;
}

export default async function Home({ searchParams }: PageProps<"/">) {
    await connection();
    const { platform: rawPlatform, channel: rawChannel, date: rawDate } = await searchParams;
    const date = parseDateFilter(rawDate);
    const platform: Platform = rawPlatform === "mobile" ? "mobile" : "desktop";
    const channel = platform === "desktop" && isChannel(rawChannel) ? rawChannel : undefined;
    const androidChannel = platform === "mobile" && isAndroidChannel(rawChannel) ? rawChannel : undefined;

    const index = await getIndex();
    const tracker = await readTrackerStatus();
    const channelBuilds = index.list(channel);
    const builds = channelBuilds.filter(b => inRange(date, b.firstSeen)).toReversed();
    const jobs = tracker?.jobs ?? [];
    const failures = tracker?.failures ?? [];
    const android = tracker?.android ?? null;
    const allAndroidBuilds = (await getAndroidBuilds()).toReversed();
    const channelAndroidBuilds = androidChannel ? allAndroidBuilds.filter(b => b.channels.includes(androidChannel)) : allAndroidBuilds;
    const androidBuilds = channelAndroidBuilds.filter(b => inRange(date, b.firstSeen));
    const dayCounts = countByDay((platform === "desktop" ? channelBuilds : channelAndroidBuilds).map(b => b.firstSeen));
    const dateLabel = date ? ` from ${formatDateFilter(date)}` : "";
    const androidJobs = android?.jobs ?? [];

    const latestAndroid = new Set<number>();
    const seenAndroid = new Set<AndroidChannel>();
    for (const build of allAndroidBuilds) {
        for (const c of build.channels) {
            if (seenAndroid.has(c)) continue;
            seenAndroid.add(c);
            latestAndroid.add(build.versionCode);
        }
    }

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
            <AutoRefresh intervalMs={(platform === "desktop" ? jobs.length : androidJobs.length) ? 2000 : 30_000} />

            <div className="inline-flex w-fit rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800" role="group" aria-label="Platform">
                {PLATFORMS.map(({ label, value, icon: Icon }) => (
                    <Link
                        key={value}
                        href={filterHref(value, undefined)}
                        aria-current={platform === value ? "page" : undefined}
                        className={tabClass(platform === value)}
                    >
                        <Icon size={16} />
                        {label}
                    </Link>
                ))}
            </div>

            <Section icon={Activity} title="Tracker">
                {!tracker && (
                    <p className={mutedTextClass}>
                        The scraper isn&apos;t running. Stored builds are still served.
                    </p>
                )}

                {platform === "desktop" && tracker && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {tracker.channels.map(c => {
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
                                        {known ? known.buildNumber : "-"}
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
                )}

                {platform === "desktop" && jobs.map(job => {
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

                {platform === "mobile" && tracker && !android && (
                    <p className={mutedTextClass}>
                        Android tracking is off. Set VENDETTA_API_URL on the scraper to turn it on.
                    </p>
                )}

                {platform === "mobile" && android && (
                    <div className={`flex flex-col gap-1.5 px-5 py-4 ${boxClass}`}>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                                <Smartphone size={16} />
                                Android
                            </span>
                            {ANDROID_CHANNELS.map(c => (
                                <span key={c} className="flex items-center gap-1.5">
                                    <ChannelBadge channel={c} />
                                    <span className="font-mono text-xs text-neutral-500 tabular-nums">{android.latest[c] ?? "-"}</span>
                                </span>
                            ))}
                            <span className="ml-auto text-xs text-neutral-500">
                                {android.checkedAt ? `checked ${timeAgo(android.checkedAt)}` : "not checked yet"}
                            </span>
                        </div>
                        {android.error && <span className="text-sm text-rose-500">{android.error}</span>}
                    </div>
                )}

                {platform === "mobile" && androidJobs.map(job => {
                    const pct = job.bytesTotal ? Math.round((job.bytesDone / job.bytesTotal) * 100) : null;
                    return (
                        <div key={job.versionCode} className={`flex flex-col gap-2 px-5 py-4 ${boxClass}`}>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <LoaderCircle size={16} className="animate-spin text-rose-500" />
                                <span className="font-medium">Downloading</span>
                                <ChannelBadge channel={job.channel} />
                                <span className="font-mono text-xs text-neutral-500">{job.versionCode}</span>
                                <span className={mutedTextClass}>{job.stage}</span>
                                {job.bytesTotal ? <span className={`ml-auto tabular-nums ${mutedTextClass}`}>{formatBytes(job.bytesDone)} / {formatBytes(job.bytesTotal)}</span> : null}
                            </div>
                            {pct != null && (
                                <div className="h-2 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-800">
                                    <div className="h-full bg-rose-500 transition-[width]" style={{ width: `${pct}%` }} />
                                </div>
                            )}
                        </div>
                    );
                })}

                {platform === "mobile" && android?.failures.map(([versionCode, f]) => (
                    <div key={versionCode} className={`flex flex-col gap-1 px-5 py-4 ${boxClass}`}>
                        <div className="flex items-center gap-2 text-sm text-rose-500">
                            <TriangleAlert size={16} />
                            <span className="font-mono text-xs">Android {versionCode}</span>
                            failed {f.count}×, retrying {timeAgo(f.retryAt)}
                        </div>
                        <span className="font-mono text-xs break-all text-neutral-500">{f.error}</span>
                    </div>
                ))}

                {platform === "desktop" && failures.map(([hash, f]) => (
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

            {platform === "desktop" ? (
                <Section icon={Package} title="Builds" badge={<span className="text-neutral-500">({builds.length})</span>}>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex w-fit rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800" role="group" aria-label="Release channel">
                            {FILTERS.map(f => (
                                <Link
                                    key={f.label}
                                    href={filterHref(platform, f.value, date)}
                                    aria-current={channel === f.value ? "page" : undefined}
                                    className={tabClass(channel === f.value)}
                                >
                                    {f.label}
                                </Link>
                            ))}
                        </div>
                        <DatePicker value={date?.value ?? null} counts={dayCounts} />
                    </div>

                    {builds.length === 0 ? (
                        <p className={mutedTextClass}>
                            {date
                                ? `No ${channel ?? ""} builds${dateLabel}.`
                                : <>No {channel ?? ""} builds yet. The tracker saves one as soon as it sees a build it doesn&apos;t have.</>}
                        </p>
                    ) : (
                        <BuildGrid
                            key={`${channel ?? "all"}-${date?.value ?? "any"}`}
                            initial={builds.slice(0, PAGE_SIZE)}
                            channel={channel}
                            date={date?.value}
                            latest={[...latest]}
                        />
                    )}
                </Section>
            ) : (
                <Section icon={Smartphone} title="Android" badge={<span className="text-neutral-500">({androidBuilds.length})</span>}>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex w-fit rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800" role="group" aria-label="Release channel">
                            {ANDROID_FILTERS.map(f => (
                                <Link
                                    key={f.label}
                                    href={filterHref(platform, f.value, date)}
                                    aria-current={androidChannel === f.value ? "page" : undefined}
                                    className={tabClass(androidChannel === f.value)}
                                >
                                    {f.label}
                                </Link>
                            ))}
                        </div>
                        <DatePicker value={date?.value ?? null} counts={dayCounts} />
                    </div>

                    {androidBuilds.length === 0 ? (
                        <p className={mutedTextClass}>
                            {date
                                ? `No ${androidChannel ?? ""} Android builds${dateLabel}.`
                                : `No ${androidChannel ?? ""} Android builds yet. The tracker downloads the bundle of every new version VendettaAPI reports.`}
                        </p>
                    ) : (
                        <AndroidBuildGrid
                            key={`${androidChannel ?? "all"}-${date?.value ?? "any"}`}
                            initial={androidBuilds.slice(0, PAGE_SIZE)}
                            channel={androidChannel}
                            date={date?.value}
                            latest={[...latestAndroid]}
                        />
                    )}
                </Section>
            )}
        </>
    );
}
