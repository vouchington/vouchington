import type { RequestQuerySummary } from '@vouchington/postgres/query-telemetry'

export const REQUEST_PROFILE_PREFIX = '[pg-request-profile]'

/**
 * One stderr line for a request, or null when it has nothing to report and `all` is off.
 *
 * Used by the API test server in backend/test-helpers, which production analysis ignores.
 */
export function formatRequestProfileLine(
  route: string,
  summary: RequestQuerySummary,
  options: { all: boolean },
): string | null {
  if (summary.repeats.length === 0 && !options.all) return null
  const repeats = summary.repeats
    .map(({ annotation, count }) => `${annotation}(x${count})`)
    .join(',')
  return `${REQUEST_PROFILE_PREFIX} route=${route} queries=${summary.totalQueries} serialDepth=${summary.serialDepth} repeats=${repeats || 'none'}\n`
}
