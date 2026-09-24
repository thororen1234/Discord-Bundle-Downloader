import { createReadStream } from "fs";
import fs from "fs/promises";
import { Readable } from "stream";

import { pack } from "./msgpack";
import type { Channel } from "./types";

export const MSGPACK_MIME_TYPE = "application/vnd.msgpack";
export const ZSTD_MIME_TYPE = "application/zstd";
export const SEVENZ_MIME_TYPE = "application/x-7z-compressed";

export function textResponse(status: number, message: string): Response {
    return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function msgpackResponse(value: unknown): Response {
    return new Response(Buffer.from(pack(value)), { headers: { "Content-Type": MSGPACK_MIME_TYPE } });
}

export async function fileResponse(file: string, contentType: string, downloadName?: string): Promise<Response> {
    const { size } = await fs.stat(file);
    const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Length": String(size),
    };
    if (downloadName) headers["Content-Disposition"] = `attachment; filename="${downloadName}"`;
    const body = Readable.toWeb(createReadStream(file, { highWaterMark: 1024 * 1024 })) as ReadableStream;
    return new Response(body, { headers });
}

export function channelParam(request: Request, fallback?: Channel): Channel | undefined | null {
    const value = new URL(request.url).searchParams.get("channel");
    if (value == null || value === "") return fallback;
    if (value === "all") return undefined;
    return value === "stable" || value === "canary" ? value : null;
}
