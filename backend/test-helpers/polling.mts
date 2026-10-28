function pollTimeoutError(description: string, maxMs: number): Error {
  return new Error(`Timed out waiting for ${description} (after ${maxMs}ms)`)
}

/**
 * Polls `fn` until it returns a non-null value, then returns it. Throws once `maxMs` elapses, so a
 * value that never appears fails the test at the wait instead of silently burning the whole
 * timeout and letting a later assertion pass vacuously. `description` names what was awaited in
 * the error. A test that must prove something stays absent asserts on a single read after the
 * operation under test has settled; it does not poll.
 */
export async function pollUntilNotNull<T>(
  fn: () => Promise<T | null | undefined>,
  maxMs = 2000,
  intervalMs = 25,
  description = 'a non-null value',
): Promise<T> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const result = await fn()
    if (result != null) return result
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  const last = await fn()
  if (last != null) return last
  throw pollTimeoutError(description, maxMs)
}
