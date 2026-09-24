export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { PHASE_PRODUCTION_BUILD } = await import("next/constants");
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;

    const { startBackgroundJobs } = await import("./lib/services");
    await startBackgroundJobs();
}
