/**
 * Runs once when the Next.js server starts (both `next dev` and the standalone
 * server in Docker): prepares the data (migrations, one-off upgrade steps, the
 * demo household) and starts the background worker.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { prepareInstall } = await import('./worker/startup');
  await prepareInstall();
  const { startWorker } = await import('./worker');
  startWorker();
}
