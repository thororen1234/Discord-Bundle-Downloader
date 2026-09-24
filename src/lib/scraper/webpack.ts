import vm from "vm";

export interface MainChunk {
    modules: Record<string, string>;
    chunkIds: string[];
    chunkFile(chunkId: string): string | null;
    buildNumber: number;
    entryPoint: number | null;
}

type ChunkUrlFn = (chunkId: unknown) => string;

const CAPTURE_PRELUDE = `
globalThis.window = globalThis;
globalThis.self = globalThis;
Object.defineProperty(Function.prototype, "m", {
    configurable: true,
    set(modules) {
        Object.defineProperty(this, "m", { value: modules, configurable: true, writable: true, enumerable: true });
        if (globalThis.__wreq || Array.isArray(modules) || !String(this).includes("exports")) return;
        globalThis.__wreq = this;
        // the runtime wraps u later to append retry query strings. keep the first one, it has the chunk map
        let current;
        Object.defineProperty(this, "u", {
            configurable: true,
            enumerable: true,
            get() { return current; },
            set(fn) { globalThis.__origU ??= fn; current = fn; },
        });
    },
});
`;

const GET_CHUNK_MAP = `(() => {
    const sym = Symbol("getChunkMap");
    let map = null;
    Object.defineProperty(Object.prototype, sym, {
        configurable: true,
        get() { map = this; return ""; },
    });
    try { __origU(sym); } finally { delete Object.prototype[sym]; }
    return map ? Object.keys(map) : [];
})()`;

const TERNARY_CHUNK_RE = /"([^"]+)"===[\w$]+\?/g;
export const CHUNK_LOAD_RE = /\.e\("?([^")]+?)"?\)/g;
const BUILD_NUMBER_RE = /build_number:"(\d+)"/;
const ENV_BUILD_NUMBER_RE = /"BUILD_NUMBER":"(\d+)"/;
const ENTRYPOINT_RES = [/=>\s*[\w$]+\((\d+)\)\)/g, /[\w$]+\([\w$]+\.s=(\d+)\)/g];

export function factoryToString(factory: unknown): string {
    const code = String(factory);
    if (code.startsWith("function") || /^(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/.test(code)) return code;
    return "function" + code.slice(code.indexOf("("));
}

function findEntryPoint(code: string): number | null {
    const tail = code.slice(-4096);
    for (const re of ENTRYPOINT_RES) {
        const matches = [...tail.matchAll(re)];
        if (matches.length) return Number(matches.at(-1)![1]);
    }
    return null;
}

export function loadMainChunk(code: string, globalEnvText: string, filename: string): MainChunk {
    const ctx = vm.createContext({});
    vm.runInContext(CAPTURE_PRELUDE, ctx);
    try {
        vm.runInContext(code, ctx, { filename, timeout: 30_000 });
    } catch { }

    const wreq = ctx.__wreq as { m: Record<string, unknown>; } | undefined;
    const origU = ctx.__origU as ChunkUrlFn | undefined;
    if (!wreq) throw new Error(`Could not capture webpack require from ${filename}`);
    if (typeof origU !== "function") throw new Error(`webpack require from ${filename} has no chunk url function`);

    const modules: Record<string, string> = {};
    for (const id in wreq.m) modules[id] = factoryToString(wreq.m[id]);

    const chunkIds = new Set<string>(vm.runInContext(GET_CHUNK_MAP, ctx));
    for (const [, id] of String(origU).matchAll(TERNARY_CHUNK_RE)) chunkIds.add(id);
    for (const src of Object.values(modules)) {
        for (const [, id] of src.matchAll(CHUNK_LOAD_RE)) chunkIds.add(id);
    }

    const chunkFile = (chunkId: string) => {
        let file: string;
        try {
            file = origU(chunkId);
        } catch {
            return null;
        }
        return typeof file === "string" && file && !file.startsWith("undefined") ? file : null;
    };

    const buildNumber = Number(BUILD_NUMBER_RE.exec(code)?.[1] ?? ENV_BUILD_NUMBER_RE.exec(globalEnvText)?.[1] ?? 0);

    return {
        modules,
        chunkIds: [...chunkIds],
        chunkFile,
        buildNumber,
        entryPoint: findEntryPoint(code),
    };
}
