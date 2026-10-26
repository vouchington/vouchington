import { getIsolationScope, withIsolationScope } from '@sentry/node'

/** Give an owned request a visible Sentry isolation scope and trace for async-context assertions. */
export function withTestSentryScope<Result>(
  requestId: string,
  traceId: string,
  run: () => Result,
): Result {
  return withIsolationScope(scope => {
    scope.setTag('test_cache_refresh_request_id', requestId)
    scope.setPropagationContext({ ...scope.getPropagationContext(), traceId })
    return run()
  })
}

export function readTestSentryScope(): { requestId: string | undefined; traceId: string } {
  const scope = getIsolationScope()
  const requestId = scope.getScopeData().tags?.test_cache_refresh_request_id
  return {
    requestId: typeof requestId === 'string' ? requestId : undefined,
    traceId: scope.getPropagationContext().traceId,
  }
}
