import { createReadStream } from "fs";
import fs from "fs/promises";
import { Readable } from "stream";

import { pack } from "./msgpack";
import { type BundleMetadata, type Channel, channelLabel, isChannel } from "./types";

export const MSGPACK_MIME_TYPE = "application/vnd.msgpack";
export const ZSTD_MIME_TYPE = "application/zstd";
export const SEVENZ_MIME_TYPE = "application/x-7z-compressed";

export function textResponse(status: number, message: string): Response {
    return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function msgpackResponse(value: unknown): Response {
    return new Response(Buffer.from(pack(value)), { headers: { "Content-Type": MSGPACK_MIME_TYPE } });
}

export function downloadName(meta: BundleMetadata, suffix: string): string {
    return `${channelLabel(meta)}-${meta.buildNumber}-${meta.buildHash}${suffix}`;
}

export function attachment(name: string): Record<string, string> {
    return { "Content-Disposition": `attachment; filename="${name}"` };
}

export async function fileResponse(file: string, contentType: string, name?: string): Promise<Response> {
    const { size } = await fs.stat(file);
    const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Length": String(size),
    };
    if (name) Object.assign(headers, attachment(name));
    const body = Readable.toWeb(createReadStream(file, { highWaterMark: 1024 * 1024 })) as ReadableStream;
    return new Response(body, { headers });
}

export function channelParam(request: Request, fallback?: Channel): Channel | undefined | null {
    const value = new URL(request.url).searchParams.get("channel");
    if (value == null || value === "") return fallback;
    if (value === "all") return undefined;
    return isChannel(value) ? value : null;
}
