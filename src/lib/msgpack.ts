import { Packr, Unpackr } from "msgpackr";

import type { BundleMetadata } from "./types";

const packr = new Packr({ useRecords: false, variableMapSize: true });
const unpackr = new Unpackr({ useRecords: false, mapsAsObjects: true, int64AsType: "number" });

export function pack(value: unknown): Uint8Array {
    return packr.pack(value);
}

export function unpack<T>(data: Uint8Array): T {
    return unpackr.unpack(data) as T;
}

export function idKeyed<V>(record: Record<string, V>): Map<number | string, V> {
    return new Map(Object.entries(record).map(([k, v]) => [/^\d+$/.test(k) ? Number(k) : k, v]));
}

export function wireMeta(meta: BundleMetadata) {
    return { ...meta, firstSeen: BigInt(meta.firstSeen) };
}
