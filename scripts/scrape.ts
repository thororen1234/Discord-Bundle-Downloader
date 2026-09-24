/*
 * Scrapes the current build of a channel once and saves it, without running the server.
 *
 *   pnpm scrape [stable|canary] [--dry-run]
 */

import { APP_ORIGINS, Config } from "../src/lib/config";
import { scrapeFullBundle } from "../src/lib/scraper";
import { ensureBuildsDir, writeFullBundle } from "../src/lib/storage";
import type { Channel } from "../src/lib/types";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const channel = (args.find(a => !a.startsWith("--")) ?? "stable") as Channel;
if (!(channel in APP_ORIGINS)) throw new Error(`Unknown channel ${channel}`);

const res = await fetch(`${APP_ORIGINS[channel]}/app`, { headers: { "User-Agent": Config.userAgent } });
const buildHash = res.headers.get("x-build-id");
if (!buildHash) throw new Error("No x-build-id header on the app response");

console.log(`Scraping ${channel} build ${buildHash}`);
const start = performance.now();
let lastStage = "";
const bundle = await scrapeFullBundle({
    channel,
    buildHash,
    html: await res.text(),
    onProgress({ stage, chunksDone, chunksTotal }) {
        if (stage !== lastStage) console.log(`  ${(lastStage = stage)}`);
        if (chunksTotal && (chunksDone % 500 === 0 || chunksDone === chunksTotal)) {
            console.log(`    ${chunksDone}/${chunksTotal}`);
        }
    },
});
console.log(`Scraped ${channel} build ${bundle.metadata.buildNumber} in ${((performance.now() - start) / 1000).toFixed(1)}s`);
console.log(`  entry point ${bundle.metadata.entryPoint}, ${Object.keys(bundle.modules).length} modules`);

if (!dryRun) {
    await ensureBuildsDir();
    await writeFullBundle(bundle);
    console.log(`Saved to ${Config.dataDir}`);
}
