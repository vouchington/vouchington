/**
 * Runs `run`, then `cleanup`. A cleanup failure after a successful run is reported, but it never
 * replaces the failure that `run` threw: that error is the one that explains the test.
 */
export async function runThenCleanup<T>(
  run: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  let result: T
  try {
    result = await run()
  } catch (err) {
    await cleanup().catch(() => undefined)
    throw err
  }
  await cleanup()
  return result
}
