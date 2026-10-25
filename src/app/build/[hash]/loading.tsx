import { LoaderCircle } from "lucide-react";

export default function Loading() {
    return (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <LoaderCircle size={16} className="animate-spin text-rose-500" />
            Loading
        </div>
    );
}
