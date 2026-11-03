"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { type DateMode, formatDateFilter, parseDateFilter } from "@/lib/dateFilter";

const MODES: { label: string; value: DateMode; }[] = [
    { label: "Day", value: "day" },
    { label: "Month", value: "month" },
    { label: "Year", value: "year" },
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(Date.UTC(2000, i, 1)));
const monthTitle = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const pad = (n: number) => String(n).padStart(2, "0");

function tabClass(active: boolean) {
    const color = active
        ? "bg-zinc-100 text-neutral-900 shadow-sm dark:bg-zinc-700 dark:text-neutral-100"
        : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";
    return `flex-1 cursor-pointer rounded-lg px-3 py-1 text-sm font-medium transition-colors ${color}`;
}

function cellClass(selected: boolean, enabled: boolean) {
    if (selected) return "bg-rose-500 font-semibold text-white";
    if (enabled) return "cursor-pointer font-medium text-neutral-800 hover:bg-zinc-200 dark:text-neutral-200 dark:hover:bg-zinc-800";
    return "cursor-default text-neutral-400 dark:text-neutral-600";
}

const navClass = "cursor-pointer rounded-lg p-1 text-neutral-500 transition-colors hover:bg-zinc-200 hover:text-neutral-900 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:hover:text-neutral-100";

export function DatePicker({ counts }: { counts: Record<string, number>; }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const selected = parseDateFilter(searchParams.get("date"));

    const totals = useMemo(() => {
        const sums: Record<string, number> = {};
        for (const [day, n] of Object.entries(counts)) {
            for (const key of [day, day.slice(0, 7), day.slice(0, 4)]) sums[key] = (sums[key] ?? 0) + n;
        }
        return sums;
    }, [counts]);
    const years = useMemo(() => Object.keys(totals).filter(k => k.length === 4).map(Number).sort((a, b) => a - b), [totals]);
    const latestDay = useMemo(() => Object.keys(counts).sort().at(-1), [counts]);

    const initialView = () => {
        const key = selected?.value ?? latestDay ?? new Date().toISOString();
        return { year: Number(key.slice(0, 4)), month: key.length >= 7 ? Number(key.slice(5, 7)) - 1 : 0 };
    };

    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<DateMode>(selected?.mode ?? "day");
    const [view, setView] = useState(initialView);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const navigate = (value: string | null) => {
        const params = new URLSearchParams(searchParams);
        if (value) params.set("date", value);
        else params.delete("date");
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
        setOpen(false);
    };

    const toggle = () => {
        if (!open) {
            setMode(selected?.mode ?? "day");
            setView(initialView());
        }
        setOpen(!open);
    };

    const minYear = years[0] ?? view.year;
    const maxYear = years.at(-1) ?? view.year;
    const shift = (delta: number) => setView(v => {
        if (mode === "month") return { ...v, year: v.year + delta };
        const date = new Date(Date.UTC(v.year, v.month + delta, 1));
        return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });
    const canShift = (delta: number) => mode === "month"
        ? (delta < 0 ? view.year > minYear : view.year < maxYear)
        : (delta < 0 ? view.year * 12 + view.month > minYear * 12 : view.year * 12 + view.month < maxYear * 12 + 11);

    const cell = (key: string, label: string | number) => {
        const n = totals[key] ?? 0;
        return (
            <button
                key={key}
                type="button"
                disabled={!n}
                onClick={() => navigate(key)}
                aria-pressed={selected?.value === key}
                title={n ? `${n} build${n === 1 ? "" : "s"}` : "No builds"}
                className={`rounded-lg py-1.5 text-sm tabular-nums transition-colors ${cellClass(selected?.value === key, n > 0)}`}
            >
                {label}
            </button>
        );
    };

    const firstWeekday = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();

    return (
        <div ref={root} className="relative w-fit">
            <div className="inline-flex items-center rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800">
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${selected
                        ? "bg-zinc-100 text-neutral-900 shadow-sm dark:bg-zinc-700 dark:text-neutral-100"
                        : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`}
                >
                    <CalendarDays size={16} />
                    {selected ? formatDateFilter(selected) : "Any date"}
                </button>
                {selected && (
                    <button
                        type="button"
                        onClick={() => navigate(null)}
                        aria-label="Clear date"
                        className="ml-1 cursor-pointer rounded-lg p-1.5 text-neutral-500 transition-colors hover:text-rose-500"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {open && (
                <div
                    role="dialog"
                    aria-label="Filter by date"
                    className="absolute left-0 z-30 mt-2 flex w-72 flex-col gap-3 rounded-2xl border border-zinc-300 bg-zinc-100 p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
                >
                    <div className="flex rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800" role="group" aria-label="Date granularity">
                        {MODES.map(m => (
                            <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => setMode(m.value)} className={tabClass(mode === m.value)}>
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {mode !== "year" && (
                        <div className="flex items-center justify-between px-1">
                            <button type="button" aria-label="Previous" disabled={!canShift(-1)} onClick={() => shift(-1)} className={navClass}>
                                <ChevronLeft size={18} />
                            </button>
                            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                                {mode === "day" ? monthTitle.format(Date.UTC(view.year, view.month, 1)) : view.year}
                            </span>
                            <button type="button" aria-label="Next" disabled={!canShift(1)} onClick={() => shift(1)} className={navClass}>
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}

                    {mode === "day" && (
                        <div className="grid grid-cols-7 gap-1 text-center">
                            {WEEKDAYS.map(d => <span key={d} className="py-1 text-xs font-medium text-neutral-500">{d}</span>)}
                            {Array.from({ length: firstWeekday }, (_, i) => <span key={`blank-${i}`} />)}
                            {Array.from({ length: daysInMonth }, (_, i) => cell(`${view.year}-${pad(view.month + 1)}-${pad(i + 1)}`, i + 1))}
                        </div>
                    )}

                    {mode === "month" && (
                        <div className="grid grid-cols-3 gap-1 text-center">
                            {MONTHS.map((label, i) => cell(`${view.year}-${pad(i + 1)}`, label))}
                        </div>
                    )}

                    {mode === "year" && (
                        <div className="grid grid-cols-3 gap-1 text-center">
                            {Array.from({ length: maxYear - minYear + 1 }, (_, i) => cell(String(minYear + i), minYear + i))}
                        </div>
                    )}

                    <p className="px-1 text-xs text-neutral-500">Dates are in UTC.</p>
                </div>
            )}
        </div>
    );
}
