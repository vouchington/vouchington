export async function settleVoteRouteOperations<T>(operations: Iterable<PromiseLike<T>>) {
  const results = await Promise.allSettled([...operations])
  const reasons = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  throwVoteRouteFailures(reasons)
  return results.map(result => (result as PromiseFulfilledResult<T>).value)
}

export function throwVoteRouteFailures(failures: unknown[]) {
  const distinct = failures.filter(
    (reason, index) => failures.findIndex(other => Object.is(other, reason)) === index,
  )
  if (distinct.length === 1) throw distinct[0]
  if (distinct.length)
    throw new AggregateError(distinct, 'Vote-route operations/observation failed')
}
