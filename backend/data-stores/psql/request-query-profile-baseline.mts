import {
  REQUEST_PROFILE_PREFIX,
  type RepeatedAnnotation,
} from './request-query-profile-summary.mts'

/** A known within-request repeat that API tests tolerate until `issue` removes it. */
export interface RepeatBaselineEntry {
  annotation: string
  reason: string
  /** Number of the GitHub issue that owns removing the repeat. */
  issue: number
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
  return `Unbaselined repeated query in ${route}: ${list}. Remove the repeat, or baseline it in backend/test-helpers/api/request-query-profile-baseline.json with a reason and an issue.`
}
