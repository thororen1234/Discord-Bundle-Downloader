import { channelParam, msgpackResponse, textResponse } from "@/lib/http";
import { getIndex } from "@/lib/services";
import { packMetadataZst } from "@/lib/storage";

export async function GET(request: Request) {
    const channel = channelParam(request);
    if (channel === null) return textResponse(400, "invalid channel");

    const index = await getIndex();
    const builds = index.list(channel).map(meta => Array.from(packMetadataZst(meta)));
    return msgpackResponse({ builds });
}
