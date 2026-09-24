import { getFullBundle } from "@/lib/bundleCache";
import { textResponse } from "@/lib/http";
import { getIndex } from "@/lib/services";

export async function GET(_request: Request, { params }: RouteContext<"/build/[hash]/module/[id]/raw">) {
    const { hash, id } = await params;
    if (!(await getIndex()).get(hash)) return textResponse(404, `build ${hash} not found`);

    const code = (await getFullBundle(hash)).modules[id];
    if (code == null) return textResponse(404, `module ${id} not found`);
    return new Response(code, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
}
