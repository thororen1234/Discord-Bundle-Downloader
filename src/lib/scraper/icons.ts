const ICON_PROPS_RE = /(?:\.d\([\w$]+,\{\},\{([\w$]+):)?function(?:\s+([\w$]+))?\(([\w$]+)\)\{(?:let|const|var) ([\w$]+)=(?:null!=\3\["aria-label"\]|\3\["aria-label"\]!=null);return \3\["aria-hidden"\]=\3\["aria-hidden"\]\?\?!\4,\3(?:\.role|\["role"\])=\3(?:\.role|\["role"\])\?\?"img",\3\}(\}\))?/;
const GETTER_EXPORT_RE = /\.d\([\w$]+,\{([\w$]+):(?:\(\)=>([\w$]+)|function\(\)\{return ([\w$]+)\})\}\)/;

export function findDefaultIconProps(modules: Record<string, string>): [number, string][] {
    const found: [number, string][] = [];
    for (const [id, code] of Object.entries(modules)) {
        if (!code.includes("\"aria-hidden\"") || !code.includes("\"img\"")) continue;
        const m = ICON_PROPS_RE.exec(code);
        if (!m) continue;
        const [, inlineName, fnName, , , closed] = m;
        if (inlineName && closed) {
            found.push([Number(id), inlineName]);
            continue;
        }
        const getter = fnName ? GETTER_EXPORT_RE.exec(code) : null;
        if (getter && (getter[2] ?? getter[3]) === fnName) found.push([Number(id), getter[1]]);
    }
    return found.sort((a, b) => a[0] - b[0]);
}
