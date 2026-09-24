import { attachment, downloadName, textResponse, ZSTD_MIME_TYPE } from "@/lib/http";
import { getIndex } from "@/lib/services";
import { isValidBuildHash, packMetadataZst } from "@/lib/storage";

export async function GET(_request: Request, { params }: RouteContext<"/build/[hash]/metadata">) {
    const { hash } = await params;
    if (!isValidBuildHash(hash)) return textResponse(400, "invalid build hash");

    const meta = (await getIndex()).get(hash);
    if (!meta) return textResponse(404, `build ${hash} not found`);
    return new Response(new Uint8Array(packMetadataZst(meta)), {
        headers: { "Content-Type": ZSTD_MIME_TYPE, ...attachment(downloadName(meta, ".meta.mpk.zst")) },
    });
}
