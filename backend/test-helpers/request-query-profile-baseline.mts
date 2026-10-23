import type { RepeatedAnnotation } from '@vouchington/postgres/query-telemetry'
import { baselineEntryProblem } from './request-query-profile-baseline-validation.mts'

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

/**
 * Parsed baseline, or an error naming every malformed or duplicate entry.
 *
 * Used by the API test server and open-issue check in backend/test-helpers.
 */
export function parseRepeatBaseline(raw: unknown): RepeatBaselineEntry[] {
  if (!Array.isArray(raw)) throw new Error('Query-profile baseline must be an array of entries')
  const problems: string[] = []
  const seen = new Map<string, Set<string | null>>()
  raw.forEach((entry: unknown, index) => {
    const problem = baselineEntryProblem(entry)
    const name = (entry as { annotation?: unknown } | null)?.annotation
    if (problem) {
      problems.push(`entry ${index} (${JSON.stringify(name)}) ${problem}`)
      return
    }
    const { annotation, route } = entry as RepeatBaselineEntry
    const routes = seen.get(annotation) ?? new Set<string | null>()
    if (routes.has(route)) problems.push(`entry ${index} (${JSON.stringify(name)}) is a duplicate`)
    else if (routes.has(null) || (route === null && routes.size > 0))
      problems.push(
        `entry ${index} (${JSON.stringify(name)}) has overlapping global and scoped entries`,
      )
    routes.add(route)
    seen.set(annotation, routes)
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
 * Used by the API test server in backend/test-helpers, which production analysis ignores.
 */
export function findUnbaselinedRepeats(
  route: string,
  repeats: readonly RepeatedAnnotation[],
  baseline: readonly RepeatBaselineEntry[],
): RepeatedAnnotation[] {
  const known = new Map<string, RepeatBaselineEntry>()
  for (const entry of baseline) {
    if (entry.route === null || entry.route === route) known.set(entry.annotation, entry)
  }
  return repeats.filter(({ annotation, count }) => {
    const entry = known.get(annotation)
    return !entry || (entry.maxCount !== null && count > entry.maxCount)
  })
}

/**
 * Failure text for one request: names the route and every unbaselined annotation.
 *
 * Used by the API test server in backend/test-helpers, which production analysis ignores.
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
 * Used by the open-issue check in backend/test-helpers.
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
