import type { AndroidChannel } from "@/lib/android/types";
import type { Channel } from "@/lib/types";

const channelClass: Record<Channel | AndroidChannel, string> = {
    stable: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    ptb: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    canary: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    beta: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    alpha: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const badgeClass = "rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase";

export function ChannelBadge({ channel }: { channel: Channel | AndroidChannel; }) {
    return <span className={`${badgeClass} ${channelClass[channel]}`}>{channel}</span>;
}

export function LatestBadge() {
    return <span className={`${badgeClass} bg-rose-500/15 text-rose-600 dark:text-rose-400`}>Latest</span>;
}
