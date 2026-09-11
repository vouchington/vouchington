import { setTimeout as delay } from 'node:timers/promises'

export async function waitFor(
  label: string,
  fn: (signal?: AbortSignal) => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 500,
  signal?: AbortSignal,
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    signal?.throwIfAborted()
    // oxlint-disable-next-line no-await-in-loop -- each readiness probe must settle before the next probe can begin
    if (await fn(signal)) {
      return
    }

    // oxlint-disable-next-line no-await-in-loop -- delay after a failed probe so retries neither overlap nor run back-to-back
    await delay(intervalMs, undefined, { signal })
  }

  throw new Error(`Timed out waiting for ${label}`)
}

export async function isHealthy(
  url: string,
  validStatuses: number[] = [200],
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const fetchSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5_000)])
      : AbortSignal.timeout(5_000)
    const response = await fetch(url, {
      signal: fetchSignal,
    })

    return validStatuses.includes(response.status)
  } catch {
    return false
  }
}

export async function poll<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs: number = 250,
): Promise<T> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    // oxlint-disable-next-line no-await-in-loop -- each poll must settle before its value is tested and another poll can begin
    const value = await fn()
    if (predicate(value)) {
      return value
    }

    // oxlint-disable-next-line no-await-in-loop -- delay after a rejected value so polling attempts remain ordered and non-overlapping
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Polling timed out after ${timeoutMs}ms`)
}
