const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
    ["second", 1000],
];

export function timeAgo(time: number, now = Date.now()): string {
    const diff = time - now;
    for (const [unit, ms] of UNITS) {
        if (Math.abs(diff) >= ms || unit === "second") return relative.format(Math.round(diff / ms), unit);
    }
    return "";
}

export function formatDate(time: number): string {
    return new Date(time).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function shortHash(hash: string): string {
    return hash.slice(0, 10);
}

export function formatCount(n: number): string {
    return n.toLocaleString("en-US");
}
