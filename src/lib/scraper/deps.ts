import type { DepInfo, IncomingModuleDeps } from "../types";

export interface OutgoingDeps {
    sync: number[];
    lazy: number[];
}

const PARAMS_RE = /^(?:async\s*)?(?:function\s*[\w$]*\s*)?\(([^)]*)\)/;

function escapeRegex(s: string): string {
    return s.replace(/[$.*+?^()[\]{}|\\]/g, "\\$&");
}

export function getOutgoingDeps(code: string): OutgoingDeps | null {
    const params = PARAMS_RE.exec(code)?.[1]?.split(",");
    const req = params?.[2]?.trim();
    if (!req || !/^[\w$]+$/.test(req)) return null;

    const r = escapeRegex(req);
    const id = "(\\d+(?:e\\d+)?)";
    const syncRe = new RegExp(`(?<![\\w$.])${r}\\(${id}\\)`, "g");
    const lazyRe = new RegExp(`(?<![\\w$.])${r}(?:\\.t)?\\.bind\\(${r},"?${id}"?[,)]`, "g");

    const sync = new Set<number>();
    const lazy = new Set<number>();
    for (const [, id] of code.matchAll(syncRe)) sync.add(Number(id));
    for (const [, id] of code.matchAll(lazyRe)) lazy.add(Number(id));
    return { sync: [...sync], lazy: [...lazy] };
}

export function computeDepInfo(modules: Record<string, string>): DepInfo {
    const moduleDeps: Record<string, IncomingModuleDeps> = {};
    const incoming = (id: number) => moduleDeps[id] ??= { sync: [], lazy: [] };

    for (const [id, code] of Object.entries(modules)) {
        const deps = getOutgoingDeps(code);
        if (!deps) continue;
        const self = Number(id);
        for (const dep of deps.sync) if (dep in modules) incoming(dep).sync.push(self);
        for (const dep of deps.lazy) if (dep in modules) incoming(dep).lazy.push(self);
    }

    return { keyModules: { fluxDispatcherClass: [] }, moduleDeps };
}
