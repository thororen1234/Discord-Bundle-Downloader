import { ArrowLeft, ArrowRight, Braces, FileArchive, FileCode, FolderDown, Search, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { ChannelBadge } from "@/components/ChannelBadge";
import { Section } from "@/components/Section";
import { getFullBundle } from "@/lib/bundleCache";
import { formatCount, formatDate, shortHash, timeAgo } from "@/lib/format";
import { getIndex } from "@/lib/services";
import { channelLabel, channelsOf } from "@/lib/types";
import { boxClass, buttonClass, cardClass, fieldClass, labelClass, mutedTextClass } from "@/lib/ui";

const MAX_RESULTS = 100;
const SNIPPET_RADIUS = 80;

export async function generateMetadata({ params }: PageProps<"/build/[hash]">): Promise<Metadata> {
    const { hash } = await params;
    const meta = (await getIndex()).get(hash);
    return { title: meta ? `Build ${meta.buildNumber} (${channelLabel(meta)})` : shortHash(hash) };
}

function Stat({ label, value }: { label: string; value: string; }) {
    return (
        <div className={`flex flex-col gap-1 px-5 py-4 ${boxClass}`}>
            <span className={labelClass}>{label}</span>
            <span className="text-lg font-semibold text-neutral-800 tabular-nums dark:text-neutral-200">{value}</span>
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
    const results: { id: string; before: string; after: string; }[] = [];
    let totalMatches = 0;
    if (query) {
        for (const [id, code] of Object.entries(bundle.modules)) {
            const at = code.indexOf(query);
            if (at === -1) continue;
            if (++totalMatches > MAX_RESULTS) continue;
            results.push({
                id,
                before: code.slice(Math.max(0, at - SNIPPET_RADIUS), at),
                after: code.slice(at + query.length, at + query.length + SNIPPET_RADIUS),
            });
        }
    }

    return (
        <>
            <div className="flex items-center justify-between text-sm font-medium">
                <Link href="/" className="flex items-center gap-1 text-neutral-600 hover:text-rose-500 hover:no-underline dark:text-neutral-400">
                    <ArrowLeft size={16} /> Builds
                </Link>
                <div className="flex gap-4">
                    {prev && (
                        <Link href={`/build/${prev.buildHash}`} className="flex items-center gap-1 text-neutral-600 hover:text-rose-500 hover:no-underline dark:text-neutral-400">
                            <ArrowLeft size={16} /> {prev.buildNumber}
                        </Link>
                    )}
                    {next && (
                        <Link href={`/build/${next.buildHash}`} className="flex items-center gap-1 text-neutral-600 hover:text-rose-500 hover:no-underline dark:text-neutral-400">
                            {next.buildNumber} <ArrowRight size={16} />
                        </Link>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-neutral-800 tabular-nums dark:text-neutral-200">
                    Build {meta.buildNumber || "?"}
                    {channelsOf(meta).map(c => <ChannelBadge key={c} channel={c} />)}
                </h1>
                <span className="font-mono text-xs break-all text-neutral-500">{meta.buildHash}</span>
                <span className={mutedTextClass}>
                    First seen {timeAgo(meta.firstSeen)} · {formatDate(meta.firstSeen)}
                </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Modules" value={formatCount(moduleCount)} />
                <Stat label="Chunks" value={formatCount(chunkCount)} />
                <Stat label="Entry point" value={meta.entryPoint != null ? String(meta.entryPoint) : "—"} />
            </div>

            <div className="flex flex-wrap gap-2">
                <a href={`/build/archive/${hash}.7z`} className={buttonClass}>
                    <FolderDown size={16} className="text-rose-500" /> Download .7z
                </a>
                <a href={`/build/${hash}/full`} className={buttonClass}>
                    <FileArchive size={16} /> data.mpk.zst
                </a>
                <a href={`/build/${hash}/metadata`} className={buttonClass}>
                    <Braces size={16} /> meta.mpk.zst
                </a>
                {meta.entryPoint != null && (
                    <Link href={`/build/${hash}/module/${meta.entryPoint}`} className={buttonClass}>
                        <FileCode size={16} /> Entry point module
                    </Link>
                )}
            </div>

            <Section icon={Search} title="Modules">
                <div className="flex flex-wrap gap-2">
                    <form className="flex min-w-72 flex-1 gap-2">
                        <input
                            name="q"
                            defaultValue={query}
                            placeholder="Search module source, e.g. getCurrentUser"
                            className={`flex-1 font-mono ${fieldClass}`}
                        />
                        <button className={buttonClass}>Search</button>
                    </form>
                    <form className="flex gap-2">
                        <input name="id" placeholder="Module id" inputMode="numeric" className={`w-32 font-mono ${fieldClass}`} />
                        <button className={buttonClass}>Open</button>
                    </form>
                </div>

                {query && (
                    <>
                        <p className={mutedTextClass}>
                            {totalMatches === 0
                                ? "No modules match."
                                : `${formatCount(totalMatches)} module${totalMatches === 1 ? "" : "s"} match`
                                + (totalMatches > MAX_RESULTS ? `, showing the first ${MAX_RESULTS}.` : ".")}
                        </p>
                        <ul className="flex flex-col gap-2">
                            {results.map(r => (
                                <li key={r.id}>
                                    <Link href={`/build/${hash}/module/${r.id}`} className={cardClass}>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-neutral-800 tabular-nums dark:text-neutral-200">{r.id}</span>
                                            <ArrowRight
                                                size={16}
                                                className="ml-auto shrink-0 text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-rose-500"
                                            />
                                        </div>
                                        <span className="truncate font-mono text-xs text-neutral-500">
                                            {r.before}
                                            <mark className="rounded-sm bg-rose-500/15 text-rose-600 dark:text-rose-400">{query}</mark>
                                            {r.after}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Section>

            <Section icon={Settings2} title="GLOBAL_ENV">
                <details className={boxClass}>
                    <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Show environment</summary>
                    <pre className="overflow-x-auto border-t border-zinc-300 px-5 py-4 font-mono text-xs whitespace-pre-wrap break-all text-neutral-600 dark:border-zinc-800 dark:text-neutral-400">
                        {bundle.envVarText.trim()}
                    </pre>
                </details>
            </Section>
        </>
    );
}
