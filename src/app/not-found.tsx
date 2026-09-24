import Link from "next/link";

export default function NotFound() {
    return (
        <div className="py-20 text-center">
            <h1 className="text-2xl font-semibold text-zinc-100">Not found</h1>
            <p className="mt-2 text-zinc-400">That build or module isn't here.</p>
            <Link href="/" className="mt-6 inline-block">Back to builds</Link>
        </div>
    );
}
