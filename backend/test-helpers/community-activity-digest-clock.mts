const defaultAnchor = '2026-07-15T23:59:59.000Z'

export function withTestDigestClock<T>(run: (businessNow: Date, input: T) => void | Promise<void>) {
  return async (input: T) => {
    const anchor = process.env.DIGEST_TEST_CLOCK_ANCHOR ?? defaultAnchor
    const date = new Date(anchor)
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== anchor) {
      throw new Error(`Invalid canonical digest clock anchor: ${anchor}`)
    }
    await run(new Date(date.getTime()), input)
  }
}
