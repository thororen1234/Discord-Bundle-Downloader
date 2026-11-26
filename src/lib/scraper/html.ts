export interface ParsedHtml {
    globalEnvText: string;
    webJsFile: string | null;
    initialChunkFiles: string[];
    stylesheetFiles: string[];
}

const GLOBAL_ENV_NEEDLE = "window.GLOBAL_ENV =";
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const ASSET_SRC_RE = /\bsrc="\/assets\/([^"?#]+\.js)"/i;
const LINK_RE = /<link\b([^>]*)>/gi;
const STYLESHEET_REL_RE = /\brel="stylesheet"/i;
const ASSET_HREF_RE = /\bhref="\/assets\/([^"?#]+\.css)"/i;

export function parseAppHtml(html: string): ParsedHtml {
    let globalEnvText: string | null = null;
    let webJsFile: string | null = null;
    const initialChunkFiles: string[] = [];
    const stylesheetFiles: string[] = [];

    for (const [, attrs, body] of html.matchAll(SCRIPT_RE)) {
        const src = ASSET_SRC_RE.exec(attrs)?.[1];
        if (src) {
            if (src.startsWith("web.")) webJsFile = src;
            else initialChunkFiles.push(src);
        } else if (globalEnvText == null && body.includes(GLOBAL_ENV_NEEDLE)) {
            globalEnvText = body;
        }
    }

    for (const [, attrs] of html.matchAll(LINK_RE)) {
        const href = ASSET_HREF_RE.exec(attrs)?.[1];
        if (href && STYLESHEET_REL_RE.test(attrs)) stylesheetFiles.push(href);
    }

    if (globalEnvText == null) throw new Error("Could not find the GLOBAL_ENV script in the app HTML");

    return { globalEnvText, webJsFile, initialChunkFiles, stylesheetFiles };
}
