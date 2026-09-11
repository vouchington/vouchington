export function buildWorkerSecretHeader(): Record<string, string> {
  const workerSecret = process.env.CF_WORKER_SECRET

  if (!workerSecret) {
    return {}
  }

  return {
    'x-cf-worker-secret': workerSecret,
  }
}
