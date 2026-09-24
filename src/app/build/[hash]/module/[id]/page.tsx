import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ChannelBadge } from "@/components/ChannelBadge";
import { getFullBundle } from "@/lib/bundleCache";
import { formatCount } from "@/lib/format";
import { getOutgoingDeps } from "@/lib/scraper/deps";
import { getIndex } from "@/lib/services";
import { channelLabel, channelsOf } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/build/[hash]/module/[id]">): Promise<Metadata> {
    const { hash, id } = await params;
    const meta = (await getIndex()).get(hash);
    return { title: `Module ${id}${meta ? ` · Build ${meta.buildNumber} (${channelLabel(meta)})` : ""}` };
}

function ModuleLinks({ hash, title, ids }: { hash: string; title: string; ids: number[]; }) {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="text-xs text-zinc-500">
                {title} <span className="text-zinc-600">({ids.length})</span>
            </div>
            {ids.length ? (
                <div className="mt-2 flex max-h-40 flex-wrap gap-x-3 gap-y-1 overflow-y-auto font-mono text-sm">
                    {ids.toSorted((a, b) => a - b).map(id => <Link key={id} href={`/build/${hash}/module/${id}`}>{id}</Link>)}
                </div>
            ) : <div className="mt-2 text-sm text-zinc-600">none</div>}
        </div>
    );
}

export default async function ModulePage({ params }: PageProps<"/build/[hash]/module/[id]">) {
    await connection();
    const { hash, id } = await params;

    const meta = (await getIndex()).get(hash);
    if (!meta) notFound();
    const bundle = await getFullBundle(hash);
    const code = bundle.modules[id];
    if (code == null) notFound();

    const incoming = bundle.depInfo.moduleDeps[id] ?? { sync: [], lazy: [] };
    const outgoing = getOutgoingDeps(code) ?? { sync: [], lazy: [] };
    const chunks = Object.entries(bundle.moduleSources)
        .filter(([, ids]) => ids.includes(Number(id)))
        .map(([file]) => file);
    const isEntryPoint = meta.entryPoint === Number(id);

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-2 text-sm">
                    <Link href={`/build/${hash}`}>← Build {meta.buildNumber || hash.slice(0, 10)}</Link>
                    {channelsOf(meta).map(c => <ChannelBadge key={c} channel={c} />)}
                </div>
                <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold text-zinc-100">
                    Module <span className="font-mono">{id}</span>
                    {isEntryPoint && (
                        <span className="rounded border border-indigo-700 bg-indigo-950 px-1.5 py-0.5 text-xs font-medium text-indigo-300">
                            entry point
                        </span>
                    )}
                </h1>
                <div className="mt-1 text-sm text-zinc-500">
                    {formatCount(code.length)} characters · in {chunks.length ? chunks.join(", ") : "no known chunk"}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <ModuleLinks hash={hash} title="Required by" ids={incoming.sync} />
                <ModuleLinks hash={hash} title="Lazily required by" ids={incoming.lazy} />
                <ModuleLinks hash={hash} title="Requires" ids={outgoing.sync.filter(d => d in bundle.modules)} />
                <ModuleLinks hash={hash} title="Lazily requires" ids={outgoing.lazy.filter(d => d in bundle.modules)} />
            </div>

            <section>
                <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Source</h2>
                    <a href={`/build/${hash}/module/${id}/raw`} className="text-sm">Raw</a>
                </div>
                <pre className="max-h-[75vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-zinc-300">
                    {code}
                </pre>
            </section>
        </div>
    );
}
