import { useCallback, useEffect, useRef, useState } from "react";

import { PAGE_SIZE } from "@/lib/types";

export function useChunkedList<T>(initial: T[], keyOf: (item: T) => string | number, loadAfter: (last: T) => Promise<T[]>) {
    const [items, setItems] = useState(initial);
    const [prevInitial, setPrevInitial] = useState(initial);
    const [done, setDone] = useState(initial.length < PAGE_SIZE);
    const [error, setError] = useState<string | null>(null);
    const loading = useRef(false);
    const sentinel = useRef<HTMLDivElement>(null);

    if (initial !== prevInitial) {
        setPrevInitial(initial);
        const fresh = new Set(initial.map(keyOf));
        setItems([...initial, ...items.filter(item => !fresh.has(keyOf(item)))]);
    }

    const loadMore = useCallback(async () => {
        const last = items.at(-1);
        if (loading.current || !last) return;
        loading.current = true;
        try {
            const next = await loadAfter(last);
            setItems(prev => {
                const known = new Set(prev.map(keyOf));
                return [...prev, ...next.filter(item => !known.has(keyOf(item)))];
            });
            if (next.length < PAGE_SIZE) setDone(true);
        } catch (e) {
            setError(String(e));
        } finally {
            loading.current = false;
        }
    }, [items, keyOf, loadAfter]);

    useEffect(() => {
        const el = sentinel.current;
        if (!el || done || error) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) void loadMore();
        }, { rootMargin: "800px" });
        observer.observe(el);
        return () => observer.disconnect();
    }, [done, error, loadMore]);

    return { items, done, error, retry: () => setError(null), sentinel };
}
