export interface ParsedHtml {
    globalEnvText: string;
    webJsFile: string;
    initialChunkFiles: string[];
}

const GLOBAL_ENV_NEEDLE = "window.GLOBAL_ENV =";
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const ASSET_SRC_RE = /\bsrc="\/assets\/([^"?#]+\.js)"/i;

export function parseAppHtml(html: string): ParsedHtml {
    let globalEnvText: string | null = null;
    let webJsFile: string | null = null;
    const initialChunkFiles: string[] = [];

    for (const [, attrs, body] of html.matchAll(SCRIPT_RE)) {
        const src = ASSET_SRC_RE.exec(attrs)?.[1];
        if (src) {
            if (src.startsWith("web.")) webJsFile = src;
            else initialChunkFiles.push(src);
        } else if (globalEnvText == null && body.includes(GLOBAL_ENV_NEEDLE)) {
            globalEnvText = body;
        }
    }

    if (globalEnvText == null) throw new Error("Could not find the GLOBAL_ENV script in the app HTML");
    if (webJsFile == null) throw new Error("Could not find the web.js entrypoint in the app HTML");

    return { globalEnvText, webJsFile, initialChunkFiles };
}
