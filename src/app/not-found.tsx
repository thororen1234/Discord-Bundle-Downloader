import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
            <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200">Not found</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">That build or module isn&apos;t here.</p>
            <Link
                href="/"
                className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-zinc-300 hover:no-underline active:scale-[.97] dark:border-zinc-800 dark:bg-zinc-900 dark:text-neutral-200 dark:hover:bg-zinc-800"
            >
                <ArrowLeft size={16} /> Back to builds
            </Link>
        </div>
    );
}
