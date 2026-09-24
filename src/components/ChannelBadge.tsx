import type { Channel } from "@/lib/types";

const channelClass: Record<Channel, string> = {
    stable: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    canary: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const badgeClass = "rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase";

export function ChannelBadge({ channel }: { channel: Channel; }) {
    return <span className={`${badgeClass} ${channelClass[channel]}`}>{channel}</span>;
}

export function LatestBadge() {
    return <span className={`${badgeClass} bg-rose-500/15 text-rose-600 dark:text-rose-400`}>Latest</span>;
}
