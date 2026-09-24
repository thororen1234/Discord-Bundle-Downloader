import { channelParam, msgpackResponse, textResponse } from "@/lib/http";
import { wireMeta } from "@/lib/msgpack";
import { getIndex } from "@/lib/services";

export async function GET(request: Request, { params }: RouteContext<"/builds/before/time/[timestamp]">) {
    const { timestamp } = await params;
    if (!/^\d+$/.test(timestamp)) return textResponse(400, "invalid timestamp");
    const channel = channelParam(request, "stable");
    if (channel === null) return textResponse(400, "invalid channel");

    const before = (await getIndex()).before(Number(timestamp), channel);
    return msgpackResponse({ before: before && wireMeta(before), after: null });
}
