import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Header } from "@/components/Header";

export const metadata: Metadata = {
    title: {
        default: "Discord Build Tracker",
        template: "%s · Discord Build Tracker",
    },
    description: "Tracks Discord web builds and archives every webpack module they ship.",
};

const themeScript = "try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';localStorage.setItem('theme',t)}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}";

export default function RootLayout({ children }: { children: ReactNode; }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
                <link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            </head>
            <body>
                <div className="flex min-h-dvh flex-col">
                    <Header />
                    <main className="flex flex-1 flex-col gap-8 px-3 pt-6 pb-10">{children}</main>
                </div>
            </body>
        </html>
    );
}
