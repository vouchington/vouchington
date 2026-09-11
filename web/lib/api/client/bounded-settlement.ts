export async function settleWithin(
  promises: Iterable<Promise<unknown>>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<boolean> {
  const settled = Promise.allSettled(promises).then(() => true)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      settled,
      new Promise<false>(resolve => {
        timeout = setTimeout(() => {
          onTimeout?.()
          resolve(false)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
