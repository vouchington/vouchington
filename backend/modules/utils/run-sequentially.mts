/** Runs dependent effects in order without suggesting that they may be parallelized. */
export function runSequentially(steps: readonly (() => Promise<unknown>)[]): Promise<void> {
  return steps.reduce<Promise<void>>(
    (pending, step) => pending.then(() => step()).then(() => undefined),
    Promise.resolve(),
  )
}
