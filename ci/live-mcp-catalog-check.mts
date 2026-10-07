/** Run a short-lived live-registry check and retain both check and cleanup failures. */
export async function runLiveMcpCatalogCheck({
  ready,
  check,
  closeResources,
}: {
  ready: Promise<void>
  check: () => void | Promise<void>
  closeResources: readonly (() => Promise<void>)[]
}): Promise<void> {
  const failures: unknown[] = []
  try {
    await ready
    await check()
  } catch (err) {
    failures.push(err)
  } finally {
    const results = await Promise.allSettled(
      closeResources.map(close => Promise.resolve().then(close)),
    )
    failures.push(
      ...results.flatMap(result => (result.status === 'rejected' ? [result.reason] : [])),
    )
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'MCP catalog check or cleanup failed')
}
