import path from "path";

import { fileResponse, textResponse, ZSTD_MIME_TYPE } from "@/lib/http";
import { buildPath, DATA_FILE_NAME, exists, isValidBuildHash } from "@/lib/storage";

export async function GET(_request: Request, { params }: RouteContext<"/build/[hash]/full">) {
    const { hash } = await params;
    if (!isValidBuildHash(hash)) return textResponse(400, "invalid build hash");

    const file = path.join(buildPath(hash), DATA_FILE_NAME);
    if (!await exists(file)) return textResponse(404, `build ${hash} not found`);
    return fileResponse(file, ZSTD_MIME_TYPE);
}
