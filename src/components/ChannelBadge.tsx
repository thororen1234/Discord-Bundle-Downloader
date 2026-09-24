import type { Channel } from "@/lib/types";

const STYLES: Record<Channel, string> = {
    stable: "border-emerald-700/60 bg-emerald-950 text-emerald-300",
    canary: "border-amber-700/60 bg-amber-950 text-amber-300",
};

export function ChannelBadge({ channel }: { channel: Channel; }) {
    return (
        <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${STYLES[channel]}`}>
            {channel}
        </span>
    );
}
