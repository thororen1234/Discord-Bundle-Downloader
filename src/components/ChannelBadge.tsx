import type { Channel } from "@/lib/types";
import { badgeClass, channelBadgeClass, latestBadgeClass } from "@/lib/ui";

export function ChannelBadge({ channel }: { channel: Channel; }) {
    return <span className={`${badgeClass} ${channelBadgeClass[channel]}`}>{channel}</span>;
}

export function LatestBadge() {
    return <span className={`${badgeClass} ${latestBadgeClass}`}>Latest</span>;
}
