import { createHmac, timingSafeEqual } from "crypto";
import http from "http";

import { type AndroidChannel, type AndroidRelease, isAndroidChannel, parseAndroidRelease } from "./types";

const MAX_BODY_BYTES = 1024 * 1024;

function validSignature(body: Buffer, header: string | string[] | undefined, secret: string): boolean {
    if (typeof header !== "string" || !header.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", secret).update(body).digest();
    const actual = Buffer.from(header.slice("sha256=".length), "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) return null;
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export function startWebhookServer(port: number, secret: string, onRelease: (channel: AndroidChannel, release: AndroidRelease) => void) {
    const server = http.createServer(async (req, res) => {
        try {
            if (req.method !== "POST") return void res.writeHead(405).end();
            const body = await readBody(req);
            if (!body) return void res.writeHead(413, { Connection: "close" }).end();
            if (!validSignature(body, req.headers["x-signature"], secret)) return void res.writeHead(401).end();

            const event = JSON.parse(body.toString("utf8"))?.event;
            if (event?.type === "android") {
                const release = parseAndroidRelease(event.release);
                if (!isAndroidChannel(event.channel) || !release) return void res.writeHead(400).end();
                onRelease(event.channel, release);
            }
            res.writeHead(204).end();
        } catch (error) {
            const malformed = error instanceof SyntaxError;
            if (!malformed) console.error("[android] webhook failed:", error);
            if (!res.headersSent) res.writeHead(malformed ? 400 : 500);
            res.end();
        }
    });
    server.listen(port, () => console.log(`[android] listening for VendettaAPI webhooks on port ${port}`));
}
