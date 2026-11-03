import { spawn } from "child_process";
import { createReadStream } from "fs";
import { createInterface } from "readline";

import { Config } from "../config";
import type { DepInfo } from "../types";

const DECOMPILE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// hermes-dec prints the global function at 4 spaces, so each Metro
// `__d(factory, id, deps)` call shows up as top level statements like
//     r0 = 4997;
//     r9 = [109, 19, 2];
//     r8 = function(a0, a1, a2, a3, a4, a5, a6) {
//     ...
//     };
//     r8 = r10.bind(r5)(r8, r0, r9);
const ASSIGN_RE = /^ {4}(r\d+) = /;
const INT_RE = / = (\d+);$/;
const ARRAY_RE = / = \[([\d, ]*)\];$/;
const FACTORY_RE = /^ {4}(r\d+) = function\(a0, a1, a2, a3, a4, a5, a6\) \{(?: \/\/.*)?$/;
const FACTORY_END = "    };";
const DEFINE_RE = /^ {4}r\d+ = r\d+\.bind\(r\d+\)\((r\d+), (r\d+), (r\d+)\);$/;

export interface DecompiledBundle {
    modules: Record<string, string>;
    depInfo: DepInfo;
}

export async function decompileHermes(bundleFile: string, outFile: string): Promise<void> {
    const child = spawn(Config.hermesDecompilerPath, [bundleFile, outFile], {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: DECOMPILE_TIMEOUT_MS,
    });
    // hermes-dec logs a warning per unresolved register, keep only the tail for errors
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-4096);
    });
    const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
    });
    if (code !== 0) throw new Error(`${Config.hermesDecompilerPath} exited with ${code}: ${stderr.trim()}`);
}

export async function splitModules(decompiledFile: string): Promise<DecompiledBundle> {
    const ints = new Map<string, number>();
    const arrays = new Map<string, number[]>();
    const modules: Record<string, string> = {};
    const outgoing = new Map<number, number[]>();

    let factory: { reg: string; lines: string[] } | null = null;
    let pending: { reg: string; source: string } | null = null;

    const lines = createInterface({ input: createReadStream(decompiledFile, "utf8"), crlfDelay: Infinity });
    for await (const line of lines) {
        if (factory) {
            if (line === FACTORY_END) {
                factory.lines.push("}");
                pending = { reg: factory.reg, source: factory.lines.join("\n") };
                factory = null;
            } else {
                factory.lines.push(line.startsWith("    ") ? line.slice(4) : line);
            }
            continue;
        }

        let match: RegExpExecArray | null;
        if ((match = FACTORY_RE.exec(line))) {
            factory = { reg: match[1], lines: [line.slice(match[1].length + 7)] };
        } else if ((match = DEFINE_RE.exec(line))) {
            const [, fn, idReg, depsReg] = match;
            const id = ints.get(idReg);
            if (pending?.reg === fn && id != null) {
                modules[id] = pending.source;
                outgoing.set(id, arrays.get(depsReg) ?? []);
            }
            pending = null;
        } else if ((match = ASSIGN_RE.exec(line))) {
            const reg = match[1];
            ints.delete(reg);
            arrays.delete(reg);
            if ((match = INT_RE.exec(line))) ints.set(reg, Number(match[1]));
            else if ((match = ARRAY_RE.exec(line))) arrays.set(reg, match[1] ? match[1].split(", ").map(Number) : []);
        }
    }

    // DepInfo.moduleDeps lists the modules that use each module
    const moduleDeps: DepInfo["moduleDeps"] = {};
    for (const [id, deps] of outgoing) {
        for (const dep of new Set(deps)) {
            if (dep in modules) (moduleDeps[dep] ??= { sync: [], lazy: [] }).sync.push(id);
        }
    }

    return { modules, depInfo: { keyModules: { fluxDispatcherClass: [] }, moduleDeps } };
}
