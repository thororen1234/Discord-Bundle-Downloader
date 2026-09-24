import { PackageSearch } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "./ThemeToggle";

const EXPLORER_URL = "https://thororen.com/discord/modules";

export function Header() {
    return (
        <header className="sticky top-0 z-40 px-3 pt-3">
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-300 bg-zinc-100/90 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
                <Link
                    href="/"
                    className="flex items-center gap-2 rounded-lg pr-2 font-semibold text-neutral-800 hover:no-underline dark:text-neutral-200"
                >
                    <PackageSearch size={20} className="text-rose-500" />
                    Discord Build Tracker
                </Link>

                <nav className="ml-auto flex items-center gap-1">
                    <Link
                        href="/"
                        className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-zinc-200 hover:no-underline dark:text-neutral-400 dark:hover:bg-zinc-800"
                    >
                        Builds
                    </Link>
                    <a
                        href={EXPLORER_URL}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-zinc-200 hover:no-underline dark:text-neutral-400 dark:hover:bg-zinc-800"
                    >
                        Explorer
                    </a>
                </nav>

                <ThemeToggle />
            </div>
        </header>
    );
}
