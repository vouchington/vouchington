import type { RepeatedAnnotation } from './request-query-profile-summary.mts'

/** A repeat tolerated until the open `issue` removes it. */
interface BaselineScope {
  /** Null preserves an intentional exception on every route. */
  route: string | null
  /** Null preserves an intentional unbounded exception. A bounded exception names one route. */
  maxCount: number | null
}

export interface TemporaryBaselineEntry extends BaselineScope {
  annotation: string
  reason: string
  /** Number of the open GitHub issue that owns removing the repeat. */
  issue: number
}

/** A repeat the code needs on purpose; the reason names the mechanism. */
export interface PermanentBaselineEntry extends BaselineScope {
  annotation: string
  reason: string
  permanent: true
  /** `<repo path>:<line or symbol>` of the code that needs the repeat. */
  code: string
}

export type RepeatBaselineEntry = TemporaryBaselineEntry | PermanentBaselineEntry

const CODE_POINTER = /^[\w./-]+\.\w+:(?:[1-9]\d*(?:-[1-9]\d*)?|[A-Za-z_$][\w$.]*)$/

function rangeIsOrdered(code: string): boolean {
  const range = /:(\d+)-(\d+)$/.exec(code)
  return range === null || Number(range[1]) <= Number(range[2])
}

function entryProblem(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null) return 'is not an object'
  const { annotation, reason, route, maxCount, ...rest } = entry as Record<string, unknown>
  if (typeof annotation !== 'string' || annotation.trim() === '')
    return 'needs a non-empty annotation'
  if (typeof reason !== 'string' || reason.trim() === '') return 'needs a non-empty reason'
  if (route !== null && (typeof route !== 'string' || !/^[A-Z]+ \/[^?\s]*$/.test(route)))
    return 'needs `route` as a method and path without a query, or null'
  if (maxCount !== null && (!Number.isInteger(maxCount) || (maxCount as number) < 2))
    return 'needs `maxCount` as an integer at least 2, or null'
  if ((route === null) !== (maxCount === null))
    return 'needs `route` and `maxCount` both scoped or both null'
  const keys = Object.keys(rest).toSorted().join(',')
  if (keys === 'issue') {
    const { issue } = rest
    if (typeof issue !== 'number' || !Number.isInteger(issue) || issue <= 0)
      return 'needs `issue` to be a positive issue number'
    return undefined
  }
  if (keys === 'code,permanent') {
    if (rest.permanent !== true) return 'needs `permanent: true`'
    if (
      typeof rest.code !== 'string' ||
      !CODE_POINTER.test(rest.code) ||
      rest.code.startsWith('/') ||
      !rangeIsOrdered(rest.code) ||
      rest.code.split(':')[0]!.split('/').includes('..')
    )
      return 'needs `code` as "<repo path>:<line or symbol>"'
    return undefined
  }
  return 'must be temporary { annotation, reason, issue } or permanent { annotation, reason, permanent: true, code }'
}

/**
 * Parsed baseline, or an error naming every malformed or duplicate entry.
 *
 * @public used by the API test server and the open-issue check in backend/test-helpers
 */
export function parseRepeatBaseline(raw: unknown): RepeatBaselineEntry[] {
  if (!Array.isArray(raw)) throw new Error('Query-profile baseline must be an array of entries')
  const problems: string[] = []
  const seen = new Set<unknown>()
  raw.forEach((entry: unknown, index) => {
    const problem = entryProblem(entry)
    const name = (entry as { annotation?: unknown } | null)?.annotation
    if (problem) problems.push(`entry ${index} (${JSON.stringify(name)}) ${problem}`)
    else if (seen.has(name))
      problems.push(`entry ${index} (${JSON.stringify(name)}) is a duplicate`)
    seen.add(name)
  })
  if (problems.length > 0) {
    throw new Error(`Malformed query-profile baseline:\n${problems.join('\n')}`)
  }
  return raw as RepeatBaselineEntry[]
}

/** Temporary entries, whose `issue` must stay open. */
export function temporaryBaselineEntries(
  baseline: readonly RepeatBaselineEntry[],
): TemporaryBaselineEntry[] {
  return baseline.filter((entry): entry is TemporaryBaselineEntry => 'issue' in entry)
}

/**
 * Repeats outside their exact baseline scope and maximum, in the order given.
 *
 * @public used by the API test server in backend/test-helpers, which production analysis ignores
 */
export function findUnbaselinedRepeats(
  route: string,
  repeats: readonly RepeatedAnnotation[],
  baseline: readonly RepeatBaselineEntry[],
): RepeatedAnnotation[] {
  const known = new Map(baseline.map(entry => [entry.annotation, entry]))
  return repeats.filter(({ annotation, count }) => {
    const entry = known.get(annotation)
    return (
      !entry ||
      (entry.route !== null && entry.route !== route) ||
      (entry.maxCount !== null && count > entry.maxCount)
    )
  })
}

/**
 * Failure text for one request: names the route and every unbaselined annotation.
 *
 * @public used by the API test server in backend/test-helpers, which production analysis ignores
 */
export function formatUnbaselinedRepeats(
  route: string,
  repeats: readonly RepeatedAnnotation[],
): string {
  const list = repeats.map(({ annotation, count }) => `${annotation} (x${count})`).join(', ')
  return `Unbaselined repeated query in ${route}: ${list}. Remove the repeat, or baseline it in backend/test-helpers/api/request-query-profile-baseline.json with a reason and an open issue (temporary), or a code pointer (permanent).`
}

/**
 * Failure text for temporary entries whose issue is not open, one line per entry. `states` maps an
 * issue number to its GitHub state; an issue missing from it counts as not found.
 *
 * @public used by the open-issue check in backend/test-helpers
 */
export function formatClosedBaselineIssues(
  baseline: readonly RepeatBaselineEntry[],
  states: ReadonlyMap<number, string>,
): string[] {
  return temporaryBaselineEntries(baseline).flatMap(({ annotation, issue }) => {
    const state = states.get(issue)?.toLowerCase()
    if (state === 'open') return []
    return [
      `Baseline entry ${annotation} points at #${issue}, which is ${state ?? 'not found'}. Remove the repeat, or re-point the entry at an open issue in "Query round-trip reductions"; a repeat the code needs on purpose becomes a permanent entry.`,
    ]
  })
}
