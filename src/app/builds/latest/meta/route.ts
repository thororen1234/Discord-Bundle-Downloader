import { channelParam, msgpackResponse, textResponse } from "@/lib/http";
import { wireMeta } from "@/lib/msgpack";
import { getIndex } from "@/lib/services";

export async function GET(request: Request) {
    const channel = channelParam(request, "stable");
    if (channel === null) return textResponse(400, "invalid channel");

    const latest = (await getIndex()).latest(channel);
    if (!latest) return textResponse(404, "server has no builds");
    return msgpackResponse(wireMeta(latest));
}
