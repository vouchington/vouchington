/** One PostgreSQL query observed inside a request scope. Times are `performance.now()` ms. */
export interface RequestQuery {
  annotation: string | null
  startMs: number
  endMs: number
  /** Cursor-batch iteration and pipelined batches are one logical statement, not a repeat. */
  excludedFromRepeats: boolean
}

export interface RepeatedAnnotation {
  annotation: string
  count: number
}

export interface RequestQuerySummary {
  totalQueries: number
  /** Largest set of queries that ran strictly one after another. */
  serialDepth: number
  repeats: RepeatedAnnotation[]
}

/**
 * Serial depth is the largest set of pairwise non-overlapping query intervals: the number of
 * round trips on the critical path. Queries overlapped by `Promise.all` count once. The classic
 * earliest-end-first greedy selection is optimal for this.
 */
export function computeSerialDepth(queries: readonly RequestQuery[]): number {
  const byEnd = queries.toSorted((left, right) => left.endMs - right.endMs)
  let depth = 0
  let chainEnd = Number.NEGATIVE_INFINITY
  for (const query of byEnd) {
    if (query.startMs < chainEnd) continue
    depth += 1
    chainEnd = query.endMs
  }
  return depth
}

/** Annotations that ran two or more times, most repeated first (ties by name). */
export function findRepeatedAnnotations(queries: readonly RequestQuery[]): RepeatedAnnotation[] {
  const counts = new Map<string, number>()
  for (const query of queries) {
    if (query.excludedFromRepeats) continue
    const annotation = query.annotation ?? 'unannotated'
    counts.set(annotation, (counts.get(annotation) ?? 0) + 1)
  }
  const repeats: RepeatedAnnotation[] = []
  for (const [annotation, count] of counts) {
    if (count >= 2) repeats.push({ annotation, count })
  }
  return repeats.toSorted(
    (left, right) => right.count - left.count || left.annotation.localeCompare(right.annotation),
  )
}

export function summarizeRequestQueries(queries: readonly RequestQuery[]): RequestQuerySummary {
  return {
    totalQueries: queries.length,
    serialDepth: computeSerialDepth(queries),
    repeats: findRepeatedAnnotations(queries),
  }
}

export const REQUEST_PROFILE_PREFIX = '[pg-request-profile]'

/**
 * One stderr line for a request, or null when it has nothing to report and `all` is off.
 *
 * @public used by the API test server in backend/test-helpers, which production analysis ignores
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
