import { bufferResponse, fileResponse, textResponse, ZSTD_MIME_TYPE } from "@/lib/http";
import { INTL_FILE_NAME, intlFile, resolveBuildHash } from "@/lib/intl";
import { readMpkZst } from "@/lib/storage";

export async function GET(request: Request, { params }: RouteContext<"/build/[hash]/intl">) {
    const hash = await resolveBuildHash((await params).hash);
    if (hash instanceof Response) return hash;

    const json = request.headers.get("accept") === "application/json";
    const file = await intlFile(hash);
    if (!file) return textResponse(404, json ? `intl messages for build ${hash} not found` : `${INTL_FILE_NAME} for build ${hash} not found`);
    if (!json) return fileResponse(file, ZSTD_MIME_TYPE);
    return bufferResponse(Buffer.from(JSON.stringify(await readMpkZst(file))), "application/json");
}
