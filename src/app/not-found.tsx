import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { mutedTextClass, outlineButtonClass } from "@/lib/ui";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
            <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200">Not found</h1>
            <p className={mutedTextClass}>That build or module isn&apos;t here.</p>
            <Link href="/" className={outlineButtonClass}>
                <ArrowLeft size={16} /> Back to builds
            </Link>
        </div>
    );
}
