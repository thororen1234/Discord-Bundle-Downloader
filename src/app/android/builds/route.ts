import { isAndroidChannel } from "@/lib/android/types";
import { textResponse } from "@/lib/http";
import { getAndroidBuilds } from "@/lib/services";

export async function GET(request: Request) {
    const channel = new URL(request.url).searchParams.get("channel") || null;
    if (channel != null && !isAndroidChannel(channel)) return textResponse(400, "invalid channel");

    const builds = await getAndroidBuilds();
    return Response.json(channel ? builds.filter(b => b.channels.includes(channel)) : builds);
}
