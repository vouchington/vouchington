/**
 * One AWS Emulator package download that has not finished within this is a stall, not latency:
 * a healthy download and start finishes in 18-20s on a CI runner, while a stalled one sat
 * until the package's own 180s download deadline and failed the whole shard's global setup with
 * no test file started (run 45776409861, shard 7).
 */
export const AWS_EMULATOR_DOWNLOAD_ATTEMPT_DEADLINE_MS = 45_000

/** The first try plus one restart. A stalled host fails in at most 90s, inside the package's own 180s. */
export const AWS_EMULATOR_DOWNLOAD_ATTEMPTS = 2

/**
 * Runs `start` under a per-attempt deadline and starts it again only when that deadline fired.
 * `start` hands the signal to the package download so a stalled transfer is cancelled, not left
 * running. A failure that is not the deadline (a digest mismatch, a refused connection) is thrown
 * at once, so a real fault is never retried into a slower failure.
 */
export async function startWithStalledDownloadRetry<T>(
  start: (attemptSignal: AbortSignal) => Promise<T>,
  options: { attempts?: number; deadlineMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? AWS_EMULATOR_DOWNLOAD_ATTEMPTS
  const deadlineMs = options.deadlineMs ?? AWS_EMULATOR_DOWNLOAD_ATTEMPT_DEADLINE_MS
  for (let attempt = 1; ; attempt++) {
    const attemptSignal = AbortSignal.timeout(deadlineMs)
    try {
      return await start(attemptSignal)
    } catch (err) {
      if (!attemptSignal.aborted || attempt >= attempts) throw err
      process.stderr.write(
        `[aws-emulator] download attempt ${attempt}/${attempts} stalled after ${deadlineMs}ms; retrying\n`,
      )
    }
  }
}
