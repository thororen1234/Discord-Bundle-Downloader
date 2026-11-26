import { textResponse } from "@/lib/http";
import { findIntlMessage } from "@/lib/intl";

function renderNode(node: unknown): string {
    if (typeof node === "string") return node;
    if (!Array.isArray(node) || !Number.isInteger(node[0])) throw new Error(`invalid intl node ${JSON.stringify(node)}`);
    const [type, value] = node;
    const named = typeof value === "string";
    switch (type) {
        case 1:
            if (node.length === 2 && named) return `[<${value}>]`;
            break;
        case 2:
        case 3:
        case 4:
            if ((node.length === 2 || node.length === 3) && named && (node[2] == null || typeof node[2] === "string")) {
                return `[${["number", "date", "time"][type - 2]} <${value}>]`;
            }
            break;
        case 5:
        case 6: {
            const options = node[2];
            const valid = type === 5
                ? node.length === 3 || node.length === 4
                : node.length === 5 && (node[4] === "cardinal" || node[4] === "ordinal");
            if (valid && named && (node[3] === undefined || Number.isInteger(node[3]) && node[3] >= 0) && options != null && typeof options === "object" && !Array.isArray(options) && Object.values(options).every(Array.isArray)) {
                Object.values(options).flat().forEach(renderNode);
                return `[${type === 5 ? "select" : "plural"} <${value}>]`;
            }
            break;
        }
        case 7:
            return "#";
        case 8:
            if ((node.length === 3 || node.length === 4) && named && Array.isArray(node[2]) && (node[3] == null || Array.isArray(node[3]))) {
                [...node[2], ...(node[3] ?? [])].forEach(renderNode);
                return "[tag node <TODO>]";
            }
            break;
        default:
            throw new Error(`unsupported intl node type ${type}`);
    }
    throw new Error(`invalid intl node ${JSON.stringify(node)}`);
}

export async function GET(request: Request, { params }: RouteContext<"/build/[hash]/intl/rendered">) {
    const message = await findIntlMessage(request, (await params).hash);
    if (message instanceof Response) return message;

    const { value } = message;
    if (typeof value !== "string" && !Array.isArray(value)) return textResponse(500, `unexpected intl message value: ${JSON.stringify(value)}`);
    const nodes = typeof value === "string" || typeof value[0] === "string" || Array.isArray(value[0]) || !value.length ? [value].flat() : [value];
    try {
        return textResponse(200, nodes.map(renderNode).join(""));
    } catch (error) {
        return textResponse(500, `Failed to render intl message: ${(error as Error).message}`);
    }
}
