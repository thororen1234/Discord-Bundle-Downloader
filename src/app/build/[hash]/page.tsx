import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { ChannelBadge } from "@/components/ChannelBadge";
import { getFullBundle } from "@/lib/bundleCache";
import { formatCount, formatDate, shortHash, timeAgo } from "@/lib/format";
import { getIndex } from "@/lib/services";
import { channelLabel, channelsOf } from "@/lib/types";

const MAX_RESULTS = 100;
const SNIPPET_RADIUS = 80;

export async function generateMetadata({ params }: PageProps<"/build/[hash]">): Promise<Metadata> {
    const { hash } = await params;
    const meta = (await getIndex()).get(hash);
    return { title: meta ? `Build ${meta.buildNumber} (${channelLabel(meta)})` : shortHash(hash) };
}

function Stat({ label, value }: { label: string; value: string; }) {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100 tabular-nums">{value}</div>
        </div>
    );
}

export default async function BuildPage({ params, searchParams }: PageProps<"/build/[hash]">) {
    await connection();
    const { hash } = await params;
    const { q: rawQuery, id: jumpId } = await searchParams;

    const index = await getIndex();
    const meta = index.get(hash);
    if (!meta) notFound();

    if (typeof jumpId === "string" && jumpId.trim()) redirect(`/build/${hash}/module/${encodeURIComponent(jumpId.trim())}`);

    const bundle = await getFullBundle(hash);
    const moduleCount = Object.keys(bundle.modules).length;
    const chunkCount = Object.keys(bundle.moduleSources).length;
    const prev = index.before(meta.firstSeen);
    const next = index.after(meta.firstSeen);

    const query = typeof rawQuery === "string" ? rawQuery : "";
    const results: { id: string; before: string; match: string; after: string; }[] = [];
    let totalMatches = 0;
    if (query) {
        for (const [id, code] of Object.entries(bundle.modules)) {
            const at = code.indexOf(query);
            if (at === -1) continue;
            if (++totalMatches > MAX_RESULTS) continue;
            results.push({
                id,
                before: code.slice(Math.max(0, at - SNIPPET_RADIUS), at),
                match: query,
                after: code.slice(at + query.length, at + query.length + SNIPPET_RADIUS),
            });
        }
    }

    return (
        <div className="space-y-8">
            <div>
                <div className="flex items-center justify-between text-sm">
                    <Link href="/">← Builds</Link>
                    <div className="flex gap-4">
                        {prev ? <Link href={`/build/${prev.buildHash}`}>← {prev.buildNumber}</Link> : null}
                        {next ? <Link href={`/build/${next.buildHash}`}>{next.buildNumber} →</Link> : null}
                    </div>
                </div>
                <h1 className="mt-4 flex flex-wrap items-center gap-3 text-2xl font-semibold text-zinc-100">
                    Build {meta.buildNumber || "?"}
                    {channelsOf(meta).map(c => <ChannelBadge key={c} channel={c} />)}
                </h1>
                <div className="mt-1 font-mono text-sm break-all text-zinc-400">{meta.buildHash}</div>
                <div className="mt-1 text-sm text-zinc-500">
                    First seen {timeAgo(meta.firstSeen)} · {formatDate(meta.firstSeen)}
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Modules" value={formatCount(moduleCount)} />
                <Stat label="Chunks" value={formatCount(chunkCount)} />
                <Stat label="Entry point" value={meta.entryPoint != null ? String(meta.entryPoint) : "—"} />
            </div>

            <section className="flex flex-wrap gap-2 text-sm">
                <a
                    href={`/build/archive/${hash}.7z`}
                    className="rounded-md bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400 hover:no-underline"
                >
                    Download .7z
                </a>
                <a href={`/build/${hash}/full`} className="rounded-md border border-zinc-700 px-3 py-1.5 hover:no-underline">
                    data.mpk.zst
                </a>
                <a href={`/build/${hash}/metadata`} className="rounded-md border border-zinc-700 px-3 py-1.5 hover:no-underline">
                    meta.mpk.zst
                </a>
                {meta.entryPoint != null && (
                    <Link
                        href={`/build/${hash}/module/${meta.entryPoint}`}
                        className="rounded-md border border-zinc-700 px-3 py-1.5 hover:no-underline"
                    >
                        Entry point module
                    </Link>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Modules</h2>
                <div className="flex flex-wrap gap-2">
                    <form className="flex min-w-72 flex-1 gap-2">
                        <input
                            name="q"
                            defaultValue={query}
                            placeholder="Search module source, e.g. getCurrentUser"
                            className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm outline-none focus:border-indigo-500"
                        />
                        <button className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">Search</button>
                    </form>
                    <form className="flex gap-2">
                        <input
                            name="id"
                            placeholder="Module id"
                            inputMode="numeric"
                            className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm outline-none focus:border-indigo-500"
                        />
                        <button className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">Open</button>
                    </form>
                </div>

                {query && (
                    <div className="space-y-2">
                        <p className="text-sm text-zinc-500">
                            {totalMatches === 0
                                ? "No modules match."
                                : `${formatCount(totalMatches)} module${totalMatches === 1 ? "" : "s"} match`
                                + (totalMatches > MAX_RESULTS ? `, showing the first ${MAX_RESULTS}.` : ".")}
                        </p>
                        {results.map(r => (
                            <Link
                                key={r.id}
                                href={`/build/${hash}/module/${r.id}`}
                                className="block rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 hover:border-zinc-700 hover:no-underline"
                            >
                                <div className="text-sm font-medium text-indigo-300">{r.id}</div>
                                <div className="mt-1 truncate font-mono text-xs text-zinc-500">
                                    {r.before}<mark className="rounded-sm bg-amber-400/20 text-amber-200">{r.match}</mark>{r.after}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <details className="rounded-lg border border-zinc-800 bg-zinc-900">
                <summary className="cursor-pointer px-4 py-2 text-sm text-zinc-300">GLOBAL_ENV</summary>
                <pre className="overflow-x-auto border-t border-zinc-800 p-4 font-mono text-xs whitespace-pre-wrap break-all text-zinc-400">
                    {bundle.envVarText.trim()}
                </pre>
            </details>
        </div>
    );
}
