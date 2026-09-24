import { ArrowLeft, Code, FileText, GitFork } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ChannelBadge } from "@/components/ChannelBadge";
import { Section } from "@/components/Section";
import { getFullBundle } from "@/lib/bundleCache";
import { formatCount } from "@/lib/format";
import { getOutgoingDeps } from "@/lib/scraper/deps";
import { getIndex } from "@/lib/services";
import { channelLabel, channelsOf } from "@/lib/types";
import { badgeClass, boxClass, buttonClass, labelClass, latestBadgeClass, mutedTextClass } from "@/lib/ui";

export async function generateMetadata({ params }: PageProps<"/build/[hash]/module/[id]">): Promise<Metadata> {
    const { hash, id } = await params;
    const meta = (await getIndex()).get(hash);
    return { title: `Module ${id}${meta ? ` · Build ${meta.buildNumber} (${channelLabel(meta)})` : ""}` };
}

function ModuleLinks({ hash, title, ids }: { hash: string; title: string; ids: number[]; }) {
    return (
        <div className={`flex flex-col gap-2 px-5 py-4 ${boxClass}`}>
            <span className={labelClass}>
                {title} <span className="text-neutral-400 dark:text-neutral-600">({ids.length})</span>
            </span>
            {ids.length ? (
                <div className="flex max-h-40 flex-wrap gap-x-3 gap-y-1 overflow-y-auto font-mono text-sm">
                    {ids.toSorted((a, b) => a - b).map(id => <Link key={id} href={`/build/${hash}/module/${id}`}>{id}</Link>)}
                </div>
            ) : <span className={mutedTextClass}>none</span>}
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
        <>
            <div className="flex items-center gap-2 text-sm font-medium">
                <Link href={`/build/${hash}`} className="flex items-center gap-1 text-neutral-600 hover:text-rose-500 hover:no-underline dark:text-neutral-400">
                    <ArrowLeft size={16} /> Build {meta.buildNumber || hash.slice(0, 10)}
                </Link>
                {channelsOf(meta).map(c => <ChannelBadge key={c} channel={c} />)}
            </div>

            <div className="flex flex-col gap-1.5">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-neutral-800 dark:text-neutral-200">
                    Module <span className="font-mono">{id}</span>
                    {isEntryPoint && <span className={`${badgeClass} ${latestBadgeClass}`}>Entry point</span>}
                </h1>
                <span className={mutedTextClass}>
                    {formatCount(code.length)} characters · in{" "}
                    <span className="font-mono text-xs">{chunks.length ? chunks.join(", ") : "no known chunk"}</span>
                </span>
            </div>

            <Section icon={GitFork} title="Dependencies">
                <div className="grid gap-3 md:grid-cols-2">
                    <ModuleLinks hash={hash} title="Required by" ids={incoming.sync} />
                    <ModuleLinks hash={hash} title="Lazily required by" ids={incoming.lazy} />
                    <ModuleLinks hash={hash} title="Requires" ids={outgoing.sync.filter(d => d in bundle.modules)} />
                    <ModuleLinks hash={hash} title="Lazily requires" ids={outgoing.lazy.filter(d => d in bundle.modules)} />
                </div>
            </Section>

            <Section
                icon={Code}
                title="Source"
                action={
                    <a href={`/build/${hash}/module/${id}/raw`} className={`py-1.5 ${buttonClass}`}>
                        <FileText size={14} /> Raw
                    </a>
                }
            >
                <pre className={`max-h-[75vh] overflow-auto px-5 py-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${boxClass}`}>
                    {code}
                </pre>
            </Section>
        </>
    );
}
