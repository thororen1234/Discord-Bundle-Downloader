import ts from "typescript";

export type ExperimentScope = "user" | "guild" | "installation";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json; };

export interface Variation {
    key: string;
    config: Json;
}

export interface Treatment {
    id: number;
    label: string;
    config: Json;
}

export interface ApexExperiment {
    kind: ExperimentScope;
    name: string;
    defaultConfig: Json;
    label: string | null;
    variations: Variation[];
}

export interface NormalExperiment {
    kind: ExperimentScope;
    id: string;
    label: string;
    default_config: Json;
    treatments: Treatment[];
    common_trigger_point: null;
}

export interface Experiment {
    loc: { id: number; span: { start: number; end: number; }; };
    obj: { apex: ApexExperiment; } | { normal: NormalExperiment; };
}

type Key = string | number;
type Value = undefined | null | boolean | number | bigint | string | Value[] | Map<Key, Value> | Set<Value>;
type Member = ts.PropertyAccessExpression | ts.ElementAccessExpression;

interface Bundle {
    modules: Record<string, string>;
    parsed: Map<number, Parsed | null>;
}

interface Parsed {
    bundle: Bundle;
    text: string;
    sf: ts.SourceFile;
    checker: ts.TypeChecker;
    idents: Map<string, ts.Identifier[]>;
    params: (ts.Symbol | undefined)[];
    exports?: Map<string, ts.Node>;
}

const APEX_PROPS = ["definition", "useConfig", "getConfig"];
const NORMAL_PROPS = ["useExperiment", "subscribe", "trackExposure", "getCurrentConfig", "definition", "isAAMode"];
const OBJECT_PROTOTYPE_PROPS = new Set(["__proto__", "constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf"]);
const SCOPES = new Set<string>(["user", "guild", "installation"]);
const FILE_NAME = "module.js";
const COMPILER_OPTIONS: ts.CompilerOptions = { allowJs: true, noLib: true, noResolve: true, types: [] };

function fail(): never {
    throw new Error("Not a constant experiment value");
}

function unparen(node: ts.Expression): ts.Expression {
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    return node;
}

function parseModule(bundle: Bundle, id: number): Parsed | undefined {
    if (bundle.parsed.has(id)) return bundle.parsed.get(id) ?? undefined;
    const src = bundle.modules[id];
    if (src == null) {
        bundle.parsed.set(id, null);
        return;
    }
    const header = src.startsWith("// Webpack Module") || src.slice(0, 100).includes("//OPEN FULL MODULE:")
        ? ""
        : `// Webpack Module ${id}\n//EXTRACTED WEBPACK MODULE ${id}\n0,\n`;
    const text = header + src;
    const sf = ts.createSourceFile(FILE_NAME, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    const checker = ts.createProgram([FILE_NAME], COMPILER_OPTIONS, {
        getSourceFile: name => name === FILE_NAME ? sf : undefined,
        getDefaultLibFileName: () => "lib.d.ts",
        writeFile: () => { },
        getCurrentDirectory: () => "",
        getCanonicalFileName: name => name,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
        fileExists: name => name === FILE_NAME,
        readFile: () => undefined,
    }).getTypeChecker();

    const idents = new Map<string, ts.Identifier[]>();
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) {
            const list = idents.get(node.text);
            if (list) list.push(node);
            else idents.set(node.text, [node]);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);

    const first = sf.statements[0];
    let factory = first && ts.isExpressionStatement(first) ? first.expression : undefined;
    while (factory && ts.isBinaryExpression(factory) && factory.operatorToken.kind === ts.SyntaxKind.CommaToken) factory = factory.right;
    factory &&= unparen(factory);
    const params = factory && (ts.isFunctionExpression(factory) || ts.isArrowFunction(factory))
        ? factory.parameters.map(p => ts.isIdentifier(p.name) ? checker.getSymbolAtLocation(p.name) : undefined)
        : [];

    const mod: Parsed = { bundle, text, sf, checker, idents, params };
    bundle.parsed.set(id, mod);
    return mod;
}

function symbolAt(mod: Parsed, id: ts.Identifier): ts.Symbol | undefined {
    return ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
        ? mod.checker.getShorthandAssignmentValueSymbol(id.parent)
        : mod.checker.getSymbolAtLocation(id);
}

function refsOf(mod: Parsed, sym: ts.Symbol | undefined): ts.Identifier[] {
    if (!sym) return [];
    return (mod.idents.get(sym.name) ?? []).filter(id => {
        const p = id.parent;
        const isName = (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionLike(p) || ts.isClassLike(p)
            || ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p)) && p.name === id;
        return !isName && !(ts.isBindingElement(p) && p.propertyName === id) && symbolAt(mod, id) === sym;
    });
}

function constantValueOf(mod: Parsed, sym: ts.Symbol | undefined): ts.Expression | undefined {
    const decl = sym?.declarations?.length === 1 ? sym.declarations[0] : undefined;
    if (!decl || !ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) return;
    const writes = refsOf(mod, sym).filter(ref => {
        let node: ts.Node = ref;
        while (
            ts.isParenthesizedExpression(node.parent) || ts.isArrayLiteralExpression(node.parent) || ts.isObjectLiteralExpression(node.parent)
            || ts.isSpreadElement(node.parent) || ts.isSpreadAssignment(node.parent) || ts.isShorthandPropertyAssignment(node.parent)
            || (ts.isPropertyAssignment(node.parent) && node.parent.initializer === node)
        ) node = node.parent;
        const p = node.parent;
        if (ts.isBinaryExpression(p)) {
            const op = p.operatorToken.kind;
            return p.left === node && op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
        }
        if (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) return p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken;
        return (ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === node;
    });
    if (decl.initializer) return writes.length ? undefined : decl.initializer;
    if (writes.length !== 1) return;
    const assign = writes[0].parent;
    return ts.isBinaryExpression(assign) && assign.left === writes[0] && assign.operatorToken.kind === ts.SyntaxKind.EqualsToken ? assign.right : undefined;
}

function wreqCall(mod: Parsed, node: ts.Node): number | undefined {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.arguments.length !== 1) return;
    const [arg] = node.arguments;
    if (!ts.isNumericLiteral(arg) || !mod.params[2] || symbolAt(mod, node.expression) !== mod.params[2]) return;
    const id = Number(arg.text);
    return Number.isInteger(id) && id >= 0 && id <= 0xffffffff ? id : undefined;
}

function staticName(name: ts.PropertyName): string | undefined {
    const key = ts.isComputedPropertyName(name) ? name.expression : name;
    if (ts.isIdentifier(key) || ts.isStringLiteral(key)) return key.text;
    if (ts.isNumericLiteral(key)) return String(Number(key.text));
}

function propValue(prop: ts.ObjectLiteralElementLike): ts.Node | undefined {
    if (ts.isPropertyAssignment(prop)) return prop.initializer;
    if (ts.isShorthandPropertyAssignment(prop)) return prop.name;
    if (!ts.isSpreadAssignment(prop)) return prop;
}

function getProperty(obj: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
    const prop = obj.properties.find(p => !ts.isSpreadAssignment(p) && staticName(p.name) === name);
    return prop && propValue(prop);
}

function stringLike(node: ts.Node): string | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
}

function exportMap(mod: Parsed): Map<string, ts.Node> {
    if (mod.exports) return mod.exports;
    const map = new Map<string, ts.Node>();
    for (const ref of refsOf(mod, mod.params[2])) {
        const access = ref.parent;
        const call = access.parent;
        if (!ts.isPropertyAccessExpression(access) || access.name.text !== "d" || !ts.isCallExpression(call) || call.expression !== access || call.arguments.length !== 2) continue;
        const [target, obj] = call.arguments;
        if (!ts.isIdentifier(target) || !mod.params[1] || symbolAt(mod, target) !== mod.params[1] || !ts.isObjectLiteralExpression(obj)) continue;
        for (const prop of obj.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isArrowFunction(prop.initializer) && !ts.isBlock(prop.initializer.body)) map.set(prop.name.getText(mod.sf), prop.initializer.body);
        }
        break;
    }
    for (const ref of refsOf(mod, mod.params[0])) {
        const access = ref.parent;
        const assign = access.parent;
        if (!ts.isPropertyAccessExpression(access) || access.name.text !== "exports" || !ts.isBinaryExpression(assign) || assign.left !== access || assign.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
        const value = unparen(assign.right);
        if (!ts.isObjectLiteralExpression(value)) continue;
        for (const prop of value.properties) {
            const v = propValue(prop);
            if (v && !ts.isSpreadAssignment(prop)) map.set(prop.name.getText(mod.sf), v);
        }
    }
    mod.exports = map;
    return map;
}

function isEnumSeed(node: ts.Expression): boolean {
    node = unparen(node);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) node = unparen(node.right);
    return ts.isObjectLiteralExpression(node) && !node.properties.length;
}

function keyFromNumber(n: number): Key {
    return Number.isNaN(n) ? "NaN" : n + 0;
}

function keyFromString(s: string): Key {
    const n = Number(s);
    return !Number.isNaN(n) && String(n) === s ? n : s;
}

function toStr(v: Value): string {
    if (Array.isArray(v)) return v.map(toStr).join(",");
    if (v instanceof Map) return "[object Object]";
    if (v instanceof Set) return "[object Set]";
    return String(v);
}

function propertyKey(v: Value): Key {
    return typeof v === "number" ? keyFromNumber(v) : keyFromString(toStr(v));
}

function resolve(mod: Parsed, node: ts.Node, resolving: unknown[]): Value {
    const isObject = (v: Value) => typeof v === "object" && v !== null;

    if (ts.isParenthesizedExpression(node)) return resolve(mod, node.expression, resolving);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isBigIntLiteral(node)) return BigInt(node.text.slice(0, -1));
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
        return node.templateSpans.reduce((s, span) => s + toStr(resolve(mod, span.expression, resolving)) + span.literal.text, node.head.text);
    }

    if (ts.isIdentifier(node)) {
        const sym = symbolAt(mod, node);
        if (!sym?.declarations?.length) {
            if (node.text === "undefined") return undefined;
            if (node.text === "NaN") return NaN;
            if (node.text === "Infinity") return Infinity;
            fail();
        }
        const init = constantValueOf(mod, sym);
        if (!init || resolving.includes(sym)) fail();
        resolving.push(sym);
        try {
            return resolve(mod, init, resolving);
        } finally {
            resolving.pop();
        }
    }

    if (ts.isArrayLiteralExpression(node)) {
        const out: Value[] = [];
        for (const el of node.elements) {
            if (ts.isOmittedExpression(el)) fail();
            if (!ts.isSpreadElement(el)) {
                out.push(resolve(mod, el, resolving));
                continue;
            }
            const spread = resolve(mod, el.expression, resolving);
            if (!Array.isArray(spread)) fail();
            out.push(...spread);
        }
        return out;
    }

    if (ts.isObjectLiteralExpression(node)) {
        const out = new Map<Key, Value>();
        for (const prop of node.properties) {
            if (ts.isSpreadAssignment(prop)) {
                const spread = resolve(mod, prop.expression, resolving);
                if (spread instanceof Map) for (const [k, v] of spread) out.set(k, v);
                else if (Array.isArray(spread)) spread.forEach((v, i) => out.set(i, v));
                else if (typeof spread === "string") {
                    if (/[\ud800-\udfff]/.test(spread)) fail();
                    [...spread].forEach((c, i) => out.set(i, c));
                }
                continue;
            }
            if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) fail();
            const { name } = prop;
            let key: Key;
            if (ts.isComputedPropertyName(name)) key = propertyKey(resolve(mod, name.expression, resolving));
            else if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) key = keyFromString(name.text);
            else if (ts.isNumericLiteral(name)) key = keyFromNumber(Number(name.text));
            else if (ts.isBigIntLiteral(name)) key = keyFromString(name.text.slice(0, -1));
            else fail();
            if (key === "__proto__" && ts.isPropertyAssignment(prop) && !ts.isComputedPropertyName(name)) fail();
            out.set(key, resolve(mod, ts.isPropertyAssignment(prop) ? prop.initializer : prop.name, resolving));
        }
        return out;
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const args = node.arguments ?? [];
        if (args.length > 1 || args.some(a => ts.isSpreadElement(a))) fail();
        const callee = node.expression;
        if (ts.isCallExpression(node)) {
            if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "freeze" || !ts.isIdentifier(callee.expression)
                || callee.expression.text !== "Object" || symbolAt(mod, callee.expression)) fail();
            return args.length ? resolve(mod, args[0], resolving) : undefined;
        }
        if (!ts.isIdentifier(callee) || callee.text !== "Set" || symbolAt(mod, callee)) fail();
        const arg = args.length ? resolve(mod, args[0], resolving) : undefined;
        if (arg == null) return new Set();
        if (Array.isArray(arg) || arg instanceof Set || typeof arg === "string") return new Set(arg);
        fail();
    }

    if (ts.isConditionalExpression(node)) return resolve(mod, resolve(mod, node.condition, resolving) ? node.whenTrue : node.whenFalse, resolving);
    if (ts.isVoidExpression(node)) return undefined;
    if (ts.isTypeOfExpression(node)) {
        const arg = unparen(node.expression);
        if (ts.isFunctionExpression(arg) || ts.isArrowFunction(arg) || ts.isClassExpression(arg)) return "function";
        return typeof resolve(mod, arg, resolving);
    }
    if (ts.isPrefixUnaryExpression(node)) {
        const v = resolve(mod, node.operand, resolving);
        if (node.operator === ts.SyntaxKind.ExclamationToken) return !v;
        if (isObject(v)) fail();
        const n = v as number;
        if (node.operator === ts.SyntaxKind.MinusToken) return -n;
        if (node.operator === ts.SyntaxKind.PlusToken) return +n;
        if (node.operator === ts.SyntaxKind.TildeToken) return ~n;
        fail();
    }

    if (ts.isBinaryExpression(node)) {
        const op = node.operatorToken.kind;
        if (op === ts.SyntaxKind.CommaToken || op === ts.SyntaxKind.EqualsToken) return resolve(mod, node.right, resolving);
        if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) fail();
        const l = resolve(mod, node.left, resolving);
        if (op === ts.SyntaxKind.BarBarToken) return l || resolve(mod, node.right, resolving);
        if (op === ts.SyntaxKind.AmpersandAmpersandToken) return l ? resolve(mod, node.right, resolving) : l;
        if (op === ts.SyntaxKind.QuestionQuestionToken) return l ?? resolve(mod, node.right, resolving);
        const r = resolve(mod, node.right, resolving);
        const lo = isObject(l), ro = isObject(r);
        const strict = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
        const loose = op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
        if (strict || loose) {
            if (lo && ro) fail();
            if (loose && lo !== ro && (lo ? r : l) != null) fail();
            // eslint-disable-next-line eqeqeq
            const equal = lo || ro ? false : strict ? l === r : l == r;
            return op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken ? equal : !equal;
        }
        if (lo || ro) fail();
        const a = l as number, b = r as number;
        switch (op) {
            case ts.SyntaxKind.LessThanToken: return a < b;
            case ts.SyntaxKind.GreaterThanToken: return a > b;
            case ts.SyntaxKind.LessThanEqualsToken: return a <= b;
            case ts.SyntaxKind.GreaterThanEqualsToken: return a >= b;
            case ts.SyntaxKind.PlusToken: return a + b;
            case ts.SyntaxKind.MinusToken: return a - b;
            case ts.SyntaxKind.AsteriskToken: return a * b;
            case ts.SyntaxKind.SlashToken: return a / b;
            case ts.SyntaxKind.PercentToken: return a % b;
            case ts.SyntaxKind.AsteriskAsteriskToken: return a ** b;
            case ts.SyntaxKind.LessThanLessThanToken: return a << b;
            case ts.SyntaxKind.GreaterThanGreaterThanToken: return a >> b;
            case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return a >>> b;
            case ts.SyntaxKind.AmpersandToken: return a & b;
            case ts.SyntaxKind.BarToken: return a | b;
            case ts.SyntaxKind.CaretToken: return a ^ b;
        }
        fail();
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const members: Member[] = [node];
        for (let e = node.expression; ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e); e = e.expression) members.unshift(e);
        const memberKey = (m: Member): Key => {
            if (ts.isElementAccessExpression(m)) return propertyKey(resolve(mod, m.argumentExpression, resolving));
            if (ts.isPrivateIdentifier(m.name)) fail();
            return keyFromString(m.name.text);
        };
        const base = unparen(members[0].expression);
        let remoteId = wreqCall(mod, base);
        if (remoteId === undefined && ts.isIdentifier(base)) {
            const init = constantValueOf(mod, symbolAt(mod, base));
            remoteId = init && wreqCall(mod, init);
        }

        const keys: Key[] = [];
        let value: Value;
        let used = 0;
        if (remoteId === undefined) value = resolve(mod, members[0].expression, resolving);
        else {
            for (const m of members) keys.push(memberKey(m));
            const remote = parseModule(mod.bundle, remoteId) ?? fail();
            let target = exportMap(remote).get(String(keys[0])) ?? fail();
            for (used = 1; used < keys.length; used++) {
                let obj = target;
                const seen = new Set<ts.Node>();
                while (!seen.has(obj)) {
                    seen.add(obj);
                    const decl = ts.isIdentifier(obj) ? symbolAt(remote, obj)?.declarations : undefined;
                    if (ts.isParenthesizedExpression(obj)) obj = obj.expression;
                    else if (decl?.length === 1 && ts.isVariableDeclaration(decl[0]) && decl[0].initializer) obj = decl[0].initializer;
                    else if (
                        ts.isCallExpression(obj) && obj.arguments.length === 1 && ts.isObjectLiteralExpression(obj.arguments[0])
                        && ts.isPropertyAccessExpression(obj.expression) && obj.expression.name.text === "freeze"
                        && ts.isIdentifier(obj.expression.expression) && obj.expression.expression.text === "Object"
                    ) obj = obj.arguments[0];
                }
                if (ts.isObjectLiteralExpression(obj)) {
                    const prop = obj.properties.find(p => !ts.isSpreadAssignment(p) && p.name.getText(remote.sf) === String(keys[used]));
                    target = (prop && propValue(prop)) ?? fail();
                    continue;
                }

                let seq: ts.Node | undefined = obj;
                let param: ts.Symbol | undefined;
                if (ts.isCallExpression(obj) && ts.isFunctionExpression(obj.expression)) {
                    const fn = obj.expression;
                    const [stmt] = fn.body.statements;
                    const ok = obj.arguments.length === 1 && isEnumSeed(obj.arguments[0]) && fn.parameters.length === 1 && ts.isIdentifier(fn.parameters[0].name)
                        && fn.body.statements.length === 1 && ts.isReturnStatement(stmt);
                    seq = ok ? stmt.expression : undefined;
                    param = ok ? symbolAt(remote, fn.parameters[0].name as ts.Identifier) : undefined;
                }
                const entries: ts.Node[] = [];
                for (; seq && ts.isBinaryExpression(seq) && seq.operatorToken.kind === ts.SyntaxKind.CommaToken; seq = seq.left) entries.unshift(seq.right);
                if (seq) entries.unshift(seq);
                const last = entries.pop();
                const enumSym = entries.length && last && ts.isIdentifier(last) ? symbolAt(remote, last) : undefined;
                if (!enumSym || (param && param !== enumSym)) break;
                const isEnum = (e: ts.Expression) => {
                    e = unparen(e);
                    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && isEnumSeed(e.right)) e = e.left;
                    return ts.isIdentifier(e) && symbolAt(remote, e) === enumSym;
                };
                const enumMembers = new Map<string, ts.Expression>();
                const isEnumObject = entries.every(entry => {
                    let assign = entry;
                    while (ts.isBinaryExpression(assign) && assign.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isElementAccessExpression(assign.left) && isEnum(assign.left.expression)) assign = assign.left.argumentExpression;
                    if (!ts.isBinaryExpression(assign) || assign.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isPropertyAccessExpression(assign.left) || !isEnum(assign.left.expression)) return false;
                    enumMembers.set(assign.left.name.text, assign.right);
                    return true;
                });
                if (!isEnumObject) break;
                target = enumMembers.get(String(keys[used])) ?? fail();
            }
            const entry = `${remoteId}:${keys.slice(0, used).join(".")}`;
            if (resolving.includes(entry)) fail();
            resolving.push(entry);
            try {
                value = resolve(remote, target, resolving);
            } finally {
                resolving.pop();
            }
        }

        for (let i = used; i < members.length; i++) {
            if (members[i].questionDotToken && value == null) return undefined;
            const key = i < keys.length ? keys[i] : memberKey(members[i]);
            if (value instanceof Map) {
                if (typeof key === "string" && !value.has(key) && OBJECT_PROTOTYPE_PROPS.has(key)) fail();
                value = value.get(key);
            } else if (Array.isArray(value) || typeof value === "string") {
                if (typeof key === "string") {
                    if (key !== "length") fail();
                    value = value.length;
                } else {
                    const el = Number.isInteger(key) && key >= 0 ? value[key] : undefined;
                    if (typeof el === "string" && /[\ud800-\udfff]/.test(el)) fail();
                    value = el;
                }
            } else if (value instanceof Set && key === "size") value = value.size;
            else fail();
        }
        return value;
    }

    fail();
}

function toJson(v: Value): Json {
    if (v == null) return null;
    if (typeof v === "bigint" || (typeof v === "number" && !Number.isFinite(v))) fail();
    if (typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(toJson);
    if (v instanceof Set) {
        const rank = (x: Value) => [
            typeof x === "number" && !Number.isNaN(x), typeof x === "number", typeof x === "bigint", typeof x === "boolean", typeof x === "string",
            Array.isArray(x), x instanceof Map, x instanceof Set, x === undefined, true,
        ].indexOf(true);
        return [...v].sort((a, b) => {
            const r = rank(a);
            if (r !== rank(b) || r === 1 || r > 4) return r - rank(b);
            return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
        }).map(toJson);
    }
    return Object.fromEntries([...v.keys()]
        .sort((a, b) => typeof a !== typeof b ? (typeof a === "number" ? -1 : 1) : (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0)
        .map(k => [String(k), toJson(v.get(k))]));
}

function configToJson(mod: Parsed, node: ts.Node | undefined): Json {
    if (!node) return null;
    try {
        return toJson(resolve(mod, node, []));
    } catch {
        return null;
    }
}

function parseScope(obj: ts.ObjectLiteralExpression): ExperimentScope {
    const kind = getProperty(obj, "kind");
    const scope = kind && stringLike(kind);
    if (scope === undefined || !SCOPES.has(scope)) fail();
    return scope as ExperimentScope;
}

function parseName(mod: Parsed, obj: ts.ObjectLiteralExpression, prop: string): string {
    const value = getProperty(obj, prop) ?? fail();
    const literal = ts.isIdentifier(value) ? constantValueOf(mod, symbolAt(mod, value)) : value;
    return (literal && stringLike(literal)) ?? fail();
}

export function findExperiments(modules: Record<string, string>): Experiment[] {
    const bundle: Bundle = { modules, parsed: new Map() };
    const ids = Object.keys(modules);
    const dependents = (id: number) => ids.filter(m => modules[m].includes(`(${id})`)).map(Number);
    const experiments: Experiment[] = [];

    for (const creatorKey of ids) {
        for (const props of [APEX_PROPS, NORMAL_PROPS]) {
            if (!props.every(p => modules[creatorKey].includes(p))) continue;
            const creatorId = Number(creatorKey);
            const creator = parseModule(bundle, creatorId);
            if (!creator) continue;
            const exportName = [...exportMap(creator)].find(([, exported]) => {
                const decl = ts.isIdentifier(exported) ? symbolAt(creator, exported)?.declarations?.[0] : undefined;
                if (!decl || !ts.isFunctionDeclaration(decl) || !decl.body) return false;
                let body = decl.body;
                for (;;) {
                    const only = body.statements.length === 1 ? body.statements[0] : undefined;
                    const callee = only && ts.isReturnStatement(only) && only.expression && ts.isCallExpression(only.expression) ? unparen(only.expression.expression) : undefined;
                    if (!callee || !ts.isFunctionExpression(callee)) break;
                    body = callee.body;
                }
                const last = body.statements.at(-1);
                const value = last && ts.isReturnStatement(last) && last.expression ? unparen(last.expression) : undefined;
                const ret = value && ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.CommaToken ? unparen(value.right) : value;
                return !!ret && ts.isObjectLiteralExpression(ret) && props.every(p => getProperty(ret, p));
            })?.[0];
            if (exportName === undefined) continue;

            const seen = new Set<string>();
            const queue = dependents(creatorId).map((m): [number, number, string] => [m, creatorId, exportName]);
            while (queue.length) {
                const [moduleId, importedId, importName] = queue.pop()!;
                if (seen.has(`${importedId}:${moduleId}`)) continue;
                seen.add(`${importedId}:${moduleId}`);
                const mod = parseModule(bundle, moduleId);
                if (!mod) continue;
                const wreqRefs = refsOf(mod, mod.params[2]);

                let decl: ts.Node | undefined = wreqRefs.find(ref => {
                    let call: ts.Node | undefined = ref.parent;
                    while (call && !ts.isCallExpression(call)) call = call.parent;
                    if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1) return false;
                    const [arg] = call.arguments;
                    return ts.isNumericLiteral(arg) && Number(arg.text) === importedId;
                });
                while (decl && !ts.isVariableDeclaration(decl)) decl = decl.parent;
                const importSym = decl && ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) ? symbolAt(mod, decl.name) : undefined;
                if (importSym) {
                    const reExports = [...exportMap(mod)].filter(([, exported]) => {
                        let first = exported;
                        while ((ts.isPropertyAccessExpression(first) || ts.isElementAccessExpression(first)) && (ts.isPropertyAccessExpression(first.expression) || ts.isElementAccessExpression(first.expression))) first = first.expression;
                        return ts.isPropertyAccessExpression(first) && first.name.text === importName && ts.isIdentifier(first.expression) && symbolAt(mod, first.expression) === importSym;
                    });
                    if (reExports.length === 1) queue.push(...dependents(moduleId).map((m): [number, number, string] => [m, moduleId, reExports[0][0]]));
                }

                const uses: ts.Node[] = [];
                for (const ref of wreqRefs) {
                    const call = ref.parent;
                    if (!ts.isCallExpression(call) || call.expression !== ref || wreqCall(mod, call) !== importedId) continue;
                    const parent = call.parent;
                    if (ts.isPropertyAccessExpression(parent) && parent.expression === call && parent.name.text === importName) uses.push(parent.name);
                    if (!ts.isVariableDeclaration(parent) || parent.initializer !== call) continue;
                    if (ts.isIdentifier(parent.name)) {
                        for (const alias of refsOf(mod, symbolAt(mod, parent.name))) {
                            if (ts.isPropertyAccessExpression(alias.parent) && alias.parent.expression === alias && alias.parent.name.text === importName) uses.push(alias.parent.name);
                        }
                    } else if (ts.isObjectBindingPattern(parent.name)) {
                        const el = parent.name.elements.find(e => staticName(e.propertyName ?? (e.name as ts.Identifier)) === importName);
                        if (el && ts.isIdentifier(el.name)) uses.push(...refsOf(mod, symbolAt(mod, el.name)));
                    }
                }

                for (const use of uses) {
                    let paren: ts.Node | undefined = use.parent;
                    while (paren && !ts.isParenthesizedExpression(paren)) paren = paren.parent;
                    if (!paren) continue;
                    const seq = paren.expression;
                    const call = paren.parent;
                    if (!ts.isBinaryExpression(seq) || seq.operatorToken.kind !== ts.SyntaxKind.CommaToken || !ts.isNumericLiteral(seq.left) || seq.left.getText(mod.sf) !== "0") continue;
                    if (!ts.isCallExpression(call) || call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0])) continue;
                    const obj = call.arguments[0];
                    const start = obj.getStart(mod.sf);
                    const loc = { id: moduleId, span: { start: Buffer.byteLength(mod.text.slice(0, start)), end: Buffer.byteLength(mod.text.slice(0, obj.end)) } };
                    try {
                        if (props === APEX_PROPS) {
                            const name = parseName(mod, obj, "name");
                            const label = getProperty(obj, "label");
                            const kind = parseScope(obj);
                            const variations = getProperty(obj, "variations");
                            let parsedVariations: Variation[] = [];
                            if (variations && ts.isObjectLiteralExpression(variations)) {
                                parsedVariations = variations.properties.map(p => ({
                                    key: (ts.isSpreadAssignment(p) ? undefined : staticName(p.name)) ?? fail(),
                                    config: configToJson(mod, propValue(p)),
                                }));
                            } else if (variations) {
                                const json = toJson(resolve(mod, variations, []));
                                if (json === null || typeof json !== "object" || Array.isArray(json)) fail();
                                parsedVariations = Object.entries(json).map(([key, config]) => ({ key, config }));
                            }
                            experiments.push({
                                loc,
                                obj: {
                                    apex: {
                                        kind,
                                        name,
                                        defaultConfig: configToJson(mod, getProperty(obj, "defaultConfig")),
                                        label: label ? stringLike(label) ?? fail() : null,
                                        variations: parsedVariations,
                                    },
                                },
                            });
                        } else {
                            const kind = parseScope(obj);
                            const id = parseName(mod, obj, "id");
                            const label = getProperty(obj, "label");
                            const treatments = getProperty(obj, "treatments");
                            if (treatments && !ts.isArrayLiteralExpression(treatments)) fail();
                            experiments.push({
                                loc,
                                obj: {
                                    normal: {
                                        kind,
                                        id,
                                        label: (label && stringLike(label)) ?? fail(),
                                        default_config: configToJson(mod, getProperty(obj, "defaultConfig")),
                                        treatments: (treatments?.elements ?? []).map(t => {
                                            if (!ts.isObjectLiteralExpression(t)) fail();
                                            const tid = getProperty(t, "id");
                                            const tlabel = getProperty(t, "label");
                                            const n = tid && ts.isNumericLiteral(tid) ? Number(tid.text) : NaN;
                                            if (!Number.isInteger(n) || n < -0x80000000 || n > 0x7fffffff) fail();
                                            return {
                                                id: n,
                                                label: (tlabel && stringLike(tlabel)) ?? fail(),
                                                config: configToJson(mod, getProperty(t, "config") ?? fail()),
                                            };
                                        }),
                                        common_trigger_point: null,
                                    },
                                },
                            });
                        }
                    } catch { }
                }
            }
        }
    }

    return experiments.sort((a, b) => a.loc.id - b.loc.id || a.loc.span.start - b.loc.span.start);
}
