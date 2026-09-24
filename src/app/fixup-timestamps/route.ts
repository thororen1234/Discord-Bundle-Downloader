import { timingSafeEqual } from "crypto";

import { Config } from "@/lib/config";
import { textResponse } from "@/lib/http";
import { fixupTimestamps } from "@/lib/services";

function authorized(request: Request): boolean {
    if (!Config.adminToken) return false;
    const given = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${Config.adminToken}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
    if (!Config.adminToken) return textResponse(404, "disabled, set ADMIN_TOKEN to enable");
    if (!authorized(request)) return textResponse(401, "unauthorized");

    await fixupTimestamps();
    return new Response(null, { status: 204 });
}
