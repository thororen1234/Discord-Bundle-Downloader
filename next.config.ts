import { execSync } from "child_process";
import type { NextConfig } from "next";

const CORS_HEADERS = [{ key: "Access-Control-Allow-Origin", value: "*" }];

function gitHash(): string {
    if (process.env.GIT_HASH) return process.env.GIT_HASH;
    try {
        return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
        return "unknown";
    }
}

const nextConfig: NextConfig = {
    // the Docker image runs the standalone server. `next start` works everywhere else
    output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
    env: {
        // served from /version, like explorer_server
        GIT_HASH: gitHash(),
    },
    // 7zip-bin resolves its bundled binary relative to its own install dir, so it can't be bundled
    serverExternalPackages: ["7zip-bin"],
    async headers() {
        return [
            { source: "/build/:path*", headers: CORS_HEADERS },
            { source: "/builds/:path*", headers: CORS_HEADERS },
            { source: "/builds", headers: CORS_HEADERS },
            { source: "/version", headers: CORS_HEADERS },
        ];
    },
};

export default nextConfig;
