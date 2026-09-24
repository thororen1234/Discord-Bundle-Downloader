import path from "path";

import { getArchive } from "@/lib/archive";
import { fileResponse, SEVENZ_MIME_TYPE, textResponse } from "@/lib/http";
import { getIndex } from "@/lib/services";
import { buildPath, DATA_FILE_NAME, exists, isValidBuildHash } from "@/lib/storage";
import { channelLabel } from "@/lib/types";

export async function GET(_request: Request, { params }: RouteContext<"/build/archive/[file]">) {
    const { file } = await params;
    const hash = file.endsWith(".7z") ? file.slice(0, -".7z".length) : null;
    if (hash == null) return textResponse(400, "invalid archive name. expected {hash}.7z");
    if (!isValidBuildHash(hash)) return textResponse(400, "invalid build hash");
    const meta = (await getIndex()).get(hash);
    if (!meta || !await exists(path.join(buildPath(hash), DATA_FILE_NAME))) return textResponse(404, `build ${hash} not found`);

    try {
        return await fileResponse(
            await getArchive(hash),
            SEVENZ_MIME_TYPE,
            `${channelLabel(meta)}-${meta.buildNumber}-${hash}.7z`,
        );
    } catch (e) {
        console.error(`[archive] failed to build ${hash}.7z:`, e);
        return textResponse(500, `internal server error: ${e}`);
    }
}
