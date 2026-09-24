import type { Channel } from "./types";

export const boxClass =
    "rounded-2xl border border-zinc-300 bg-zinc-100 text-neutral-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-neutral-300";

export const cardClass =
    `group flex h-full flex-col gap-1.5 px-5 py-4 transition-colors hover:border-zinc-400 hover:no-underline dark:hover:border-zinc-700 ${boxClass}`;

export const buttonClass =
    "inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-zinc-200 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-zinc-300 hover:no-underline active:scale-[.97] dark:bg-zinc-800 dark:text-neutral-200 dark:hover:bg-zinc-700";

export const outlineButtonClass =
    "inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-zinc-300 hover:no-underline active:scale-[.97] dark:border-zinc-800 dark:bg-zinc-900 dark:text-neutral-200 dark:hover:bg-zinc-800";

export const fieldClass =
    "w-full rounded-xl bg-zinc-200 px-3 py-2 text-sm text-neutral-800 ring-1 ring-transparent outline-none placeholder:text-neutral-500 focus:ring-rose-500 dark:bg-zinc-800 dark:text-neutral-200";

export const labelClass = "text-xs font-medium text-neutral-500 dark:text-neutral-400";

export const mutedTextClass = "text-sm text-neutral-500 dark:text-neutral-400";

export const headingClass = "text-neutral-800 dark:text-neutral-200";

export const tabGroupClass = "inline-flex w-fit rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800";

export function tabClass(active: boolean): string {
    return `flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:no-underline ${active
        ? "bg-zinc-100 text-neutral-900 shadow-sm dark:bg-zinc-700 dark:text-neutral-100"
        : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`;
}

export const badgeClass = "rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase";

export const channelBadgeClass: Record<Channel, string> = {
    stable: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    canary: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export const latestBadgeClass = "bg-rose-500/15 text-rose-600 dark:text-rose-400";
