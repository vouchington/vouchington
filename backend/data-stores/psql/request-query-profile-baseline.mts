import {
  REQUEST_PROFILE_PREFIX,
  type RepeatedAnnotation,
} from './request-query-profile-summary.mts'

/** A repeat tolerated until the open `issue` removes it. */
export interface TemporaryBaselineEntry {
  annotation: string
  reason: string
  /** Number of the open GitHub issue that owns removing the repeat. */
  issue: number
}

/** A repeat the code needs on purpose; the reason names the mechanism. */
export interface PermanentBaselineEntry {
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
  const { annotation, reason, ...rest } = entry as Record<string, unknown>
  if (typeof annotation !== 'string' || annotation.trim() === '')
    return 'needs a non-empty annotation'
  if (typeof reason !== 'string' || reason.trim() === '') return 'needs a non-empty reason'
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
 * Repeats that are not in the baseline, in the order given. A baselined annotation may repeat on
 * any route and any number of times: the baseline is per annotation, not per route.
 *
 * @public used by the API test server in backend/test-helpers, which production analysis ignores
 */
export function findUnbaselinedRepeats(
  repeats: readonly RepeatedAnnotation[],
  baseline: readonly RepeatBaselineEntry[],
): RepeatedAnnotation[] {
  const known = new Set(baseline.map(entry => entry.annotation))
  return repeats.filter(({ annotation }) => !known.has(annotation))
}

/**
 * Baseline entries whose annotation was not observed repeating. Report-only: a stale entry means
 * the fix landed, so the entry should be deleted, but it never fails a run.
 *
 * @public used by the stale-entry report in backend/test-helpers
 */
export function findStaleBaselineEntries(
  baseline: readonly RepeatBaselineEntry[],
  observedAnnotations: ReadonlySet<string>,
): RepeatBaselineEntry[] {
  return baseline.filter(({ annotation }) => !observedAnnotations.has(annotation))
}

/** Completed main merge-group Backend runs a stale report needs before it is safe to act on. */
export const MIN_STALE_EVIDENCE_LOGS = 5

export interface StaleReport {
  logCount: number
  /** False when fewer than {@link MIN_STALE_EVIDENCE_LOGS} logs were given. */
  sufficient: boolean
  stale: RepeatBaselineEntry[]
}

/**
 * Stale entries across independent run logs (one log text per run): an entry is stale only when it
 * is absent from every log, because a data-dependent repeat can miss any single run.
 *
 * @public used by the stale-entry report in backend/test-helpers
 */
export function buildStaleReport(
  baseline: readonly RepeatBaselineEntry[],
  logTexts: readonly string[],
): StaleReport {
  const observed = new Set<string>()
  for (const text of logTexts) {
    for (const annotation of observedRepeatAnnotations(text)) observed.add(annotation)
  }
  return {
    logCount: logTexts.length,
    sufficient: logTexts.length >= MIN_STALE_EVIDENCE_LOGS,
    stale: findStaleBaselineEntries(baseline, observed),
  }
}

/**
 * Annotations that repeated in `[pg-request-profile]` lines of CI log text (one run, any shard).
 *
 * @public used by the stale-entry report in backend/test-helpers
 */
export function observedRepeatAnnotations(logText: string): Set<string> {
  const observed = new Set<string>()
  for (const line of logText.split('\n')) {
    const start = line.indexOf(REQUEST_PROFILE_PREFIX)
    if (start === -1) continue
    // Annotations may contain spaces ("fn variant"), so the list runs to the end of the line.
    const repeats = / repeats=(.*)$/.exec(line.slice(start).trimEnd())?.[1]
    if (!repeats || repeats === 'none') continue
    for (const match of repeats.matchAll(/([^,]+?)\(x\d+\)(?:,|$)/g)) {
      if (match[1]) observed.add(match[1])
    }
  }
  return observed
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
