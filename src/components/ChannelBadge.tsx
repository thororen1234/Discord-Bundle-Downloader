import { badgeClass, channelBadgeClass, latestBadgeClass } from "@/lib/ui";
import type { Channel } from "@/lib/types";

export function ChannelBadge({ channel }: { channel: Channel; }) {
    return <span className={`${badgeClass} ${channelBadgeClass[channel]}`}>{channel}</span>;
}

export function LatestBadge() {
    return <span className={`${badgeClass} ${latestBadgeClass}`}>Latest</span>;
}
