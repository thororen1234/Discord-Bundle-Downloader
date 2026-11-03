export type DateMode = "day" | "month" | "year";

export interface DateRange {
    value: string;
    mode: DateMode;
    start: number;
    end: number;
}

const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function parseDateFilter(value: unknown): DateRange | null {
    if (typeof value !== "string") return null;
    const match = DATE_RE.exec(value);
    if (!match) return null;
    const [, y, m, d] = match;
    const year = Number(y);
    const month = m ? Number(m) - 1 : 0;
    const day = d ? Number(d) : 1;
    const start = Date.UTC(year, month, day);
    const date = new Date(start);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;

    if (d) return { value, mode: "day", start, end: Date.UTC(year, month, day + 1) };
    if (m) return { value, mode: "month", start, end: Date.UTC(year, month + 1, 1) };
    return { value, mode: "year", start, end: Date.UTC(year + 1, 0, 1) };
}

export function inRange(range: DateRange | null, time: number): boolean {
    return !range || (time >= range.start && time < range.end);
}

export function dayKey(time: number): string {
    return new Date(time).toISOString().slice(0, 10);
}

export function countByDay(times: number[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const time of times) {
        const key = dayKey(time);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function formatDateFilter(range: DateRange): string {
    if (range.mode === "day") return dayFormat.format(range.start);
    if (range.mode === "month") return monthFormat.format(range.start);
    return range.value;
}
