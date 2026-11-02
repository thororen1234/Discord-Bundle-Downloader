"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { loadAndroidBuilds, loadBuilds } from "@/app/actions";
import type { AndroidBuild } from "@/lib/android/types";
import type { BundleMetadata } from "@/lib/types";

import { AndroidBuildCard } from "./AndroidBuildCard";
import { BuildCard } from "./BuildCard";
import { useChunkedList } from "./useChunkedList";

const buildKey = (b: BundleMetadata) => b.buildHash;
const androidKey = (b: AndroidBuild) => b.versionCode;

export function BuildGrid({ initial, channel, latest }: { initial: BundleMetadata[]; channel?: string; latest: string[]; }) {
    const list = useChunkedList(initial, buildKey, last => loadBuilds(channel, last.firstSeen));
    return (
        <Grid {...list}>
            {list.items.map(b => (
                <li key={b.buildHash}>
                    <BuildCard build={b} latest={latest.includes(b.buildHash)} />
                </li>
            ))}
        </Grid>
    );
}

export function AndroidBuildGrid({ initial, channel, latest }: { initial: AndroidBuild[]; channel?: string; latest: number[]; }) {
    const list = useChunkedList(initial, androidKey, last => loadAndroidBuilds(channel, last.versionCode));
    return (
        <Grid {...list}>
            {list.items.map(b => (
                <li key={b.versionCode}>
                    <AndroidBuildCard build={b} latest={latest.includes(b.versionCode)} />
                </li>
            ))}
        </Grid>
    );
}

function Grid({ children, done, error, retry, sentinel }: {
    children: ReactNode;
    done: boolean;
    error: string | null;
    retry: () => void;
    sentinel: RefObject<HTMLDivElement | null>;
}) {
    return (
        <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</ul>
            {error ? (
                <p className="text-sm text-rose-500">
                    Couldn&apos;t load more builds: {error}{" "}
                    <button type="button" onClick={retry} className="cursor-pointer underline">Retry</button>
                </p>
            ) : !done && (
                <div ref={sentinel} className="flex justify-center py-2 text-neutral-500">
                    <LoaderCircle size={20} className="animate-spin" />
                </div>
            )}
        </>
    );
}
