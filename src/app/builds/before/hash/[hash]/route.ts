import { channelParam, msgpackResponse, textResponse } from "@/lib/http";
import { wireMeta } from "@/lib/msgpack";
import { getIndex } from "@/lib/services";

export async function GET(request: Request, { params }: RouteContext<"/builds/before/hash/[hash]">) {
    const { hash } = await params;
    const channel = channelParam(request, "stable");
    if (channel === null) return textResponse(400, "invalid channel");

    const index = await getIndex();
    const build = index.get(hash);
    if (!build) return new Response(null, { status: 404 });

    const before = index.before(build.firstSeen, channel);
    return msgpackResponse({ before: before && wireMeta(before), after: null });
}
