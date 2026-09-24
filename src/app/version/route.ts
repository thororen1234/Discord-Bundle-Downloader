export function GET() {
    return new Response(process.env.GIT_HASH ?? "unknown", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
