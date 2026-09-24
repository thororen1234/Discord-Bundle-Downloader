const globalStore = globalThis as typeof globalThis & {
    bundleDownloader?: Record<string, unknown>;
};

export function persistent<T>(key: string, create: () => T): T {
    const values = globalStore.bundleDownloader ??= {};
    return (values[key] ??= create()) as T;
}
