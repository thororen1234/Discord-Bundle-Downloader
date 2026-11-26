export interface IntlMessage {
    module: number;
    value: unknown;
}

export interface IntlMessages {
    modules: number[];
    messages: Record<string, IntlMessage>;
}

const LOADER_EXPORTS = [
    "makeMessagesProxy",
    "chainMessagesObjects",
    "MessageLoader",
    "waitForAllDefaultIntlMessagesLoaded",
    "loadAllMessagesInLocale",
    "createLoader",
    "InternalIntlMessage",
    "DEFAULT_LOCALE",
    "IntlManager",
    "runtimeHashMessageKey",
    "bindFormatValues",
    "FormatBuilder",
    "dataFormatterCache",
    "makeDataFormatters",
];

const EN_US_LOADER_RE = /"en-US":\(\)=>[^;]*?\.then\(([\w$]+)\.bind\(\1,(\d+)\)\)/g;
const JSON_PARSE_RE = /JSON\.parse\(('[^'\\]*(?:\\[\s\S][^'\\]*)*'|"[^"\\]*(?:\\[\s\S][^"\\]*)*")\)/;
const STRING_ESCAPE_RE = /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g;
const SINGLE_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };

export function findIntl(modules: Record<string, string>): IntlMessages {
    const sources = Object.values(modules);
    if (!sources.some(src => LOADER_EXPORTS.every(name => src.includes(name)))) {
        throw new Error("No module defines createLoader");
    }

    const ids = new Set<number>();
    for (const src of sources) {
        if (!src.includes("},\"en-US\")")) continue;
        for (const match of src.matchAll(EN_US_LOADER_RE)) ids.add(Number(match[2]));
    }

    const sorted = [...ids].sort((a, b) => a - b);
    const messages: Record<string, IntlMessage> = {};
    for (const id of sorted) {
        const literal = modules[id] == null ? undefined : JSON_PARSE_RE.exec(modules[id])?.[1];
        if (literal == null) {
            console.warn(`[intl] module ${id} is not a JSON module`);
            continue;
        }
        const text = literal.slice(1, -1).replace(STRING_ESCAPE_RE, (_, codePoint, u, x, ch) => {
            if (codePoint) return String.fromCodePoint(parseInt(codePoint, 16));
            if (u ?? x) return String.fromCharCode(parseInt(u ?? x, 16));
            return SINGLE_ESCAPES[ch] ?? (/^[\r\n\u2028\u2029]/.test(ch) ? "" : ch);
        });
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch (error) {
            console.warn(`[intl] module ${id} has invalid JSON: ${(error as Error).message}`);
            continue;
        }
        if (json == null || typeof json !== "object" || Array.isArray(json)) {
            console.warn(`[intl] module ${id} is not a JSON object`);
            continue;
        }
        for (const [key, value] of Object.entries(json)) {
            const previous = messages[key];
            if (previous) console.warn(`[intl] key ${key} is defined in both ${previous.module} and ${id}, keeping ${id}`);
            messages[key] = { module: id, value };
        }
    }
    return { modules: sorted, messages };
}
