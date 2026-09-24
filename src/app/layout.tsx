import "./globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: {
        default: "Discord Bundle Downloader",
        template: "%s · Discord Bundle Downloader",
    },
    description: "Tracks Discord web builds and archives every webpack module they ship.",
};

export default function RootLayout({ children }: { children: ReactNode; }) {
    return (
        <html lang="en">
            <body className="min-h-screen">
                <header className="border-b border-zinc-800 bg-zinc-900/60">
                    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
                        <Link href="/" className="font-semibold text-zinc-100 hover:text-white hover:no-underline">
                            Discord Bundle Downloader
                        </Link>
                        <nav className="flex gap-4 text-sm">
                            <Link href="/">Builds</Link>
                            <a href="/builds/latest/meta">API</a>
                        </nav>
                    </div>
                </header>
                <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
            </body>
        </html>
    );
}
