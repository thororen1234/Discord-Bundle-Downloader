import { channelParam, msgpackResponse, textResponse } from "@/lib/http";
import { getIndex } from "@/lib/services";
import { packMetadataZst } from "@/lib/storage";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
    const channel = channelParam(request);
    if (channel === null) return textResponse(400, "invalid channel");

    const params = new URL(request.url).searchParams;
    const limit = Number(params.get("limit") || DEFAULT_LIMIT);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return textResponse(400, `limit must be an integer from 1 to ${MAX_LIMIT}`);
    const before = params.get("before");
    if (before != null && !/^\d+$/.test(before)) return textResponse(400, "invalid before");

    const list = (await getIndex()).list(channel);
    const end = before == null ? list.length : list.findLastIndex(m => m.firstSeen < Number(before)) + 1;
    const page = list.slice(Math.max(0, end - limit), end).reverse();
    return msgpackResponse({
        builds: page.map(meta => Array.from(packMetadataZst(meta))),
        ...end > limit && { nextCursor: page.at(-1)!.firstSeen },
    });
}
