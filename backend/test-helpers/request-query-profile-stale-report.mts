import { REQUEST_PROFILE_PREFIX } from './request-query-profile-line.mts'
import type { RepeatBaselineEntry } from './request-query-profile-baseline.mts'

/**
 * Baseline entries whose annotation was not observed repeating. Report-only: a stale entry means
 * the fix landed, so the entry should be deleted, but it never fails a run.
 *
 * Used by the stale-entry report in backend/test-helpers.
 */
export function findStaleBaselineEntries(
  baseline: readonly RepeatBaselineEntry[],
  observedAnnotations: ReadonlySet<string>,
  observedScopedRepeats: ReadonlySet<string>,
): RepeatBaselineEntry[] {
  return baseline.filter(entry =>
    entry.route === null
      ? !observedAnnotations.has(entry.annotation)
      : !observedScopedRepeats.has(`${entry.route}\0${entry.annotation}`),
  )
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
 * Used by the stale-entry report in backend/test-helpers.
 */
export function buildStaleReport(
  baseline: readonly RepeatBaselineEntry[],
  logTexts: readonly string[],
): StaleReport {
  const observed = new Set<string>()
  const observedScoped = new Set<string>()
  for (const text of logTexts) {
    for (const annotation of observedRepeatAnnotations(text)) observed.add(annotation)
    for (const key of observedScopedRepeatKeys(text)) observedScoped.add(key)
  }
  return {
    logCount: logTexts.length,
    sufficient: logTexts.length >= MIN_STALE_EVIDENCE_LOGS,
    stale: findStaleBaselineEntries(baseline, observed, observedScoped),
  }
}

/**
 * Annotations that repeated in `[pg-request-profile]` lines of CI log text (one run, any shard).
 *
 * Used by the stale-entry report in backend/test-helpers.
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

/** Exact route/annotation observations for scoped baseline entries. */
export function observedScopedRepeatKeys(logText: string): Set<string> {
  const observed = new Set<string>()
  for (const line of logText.split('\n')) {
    const start = line.indexOf(REQUEST_PROFILE_PREFIX)
    if (start === -1) continue
    const profile = line.slice(start).trimEnd()
    const route = / route=(.+?) queries=/.exec(profile)?.[1]
    const repeats = / repeats=(.*)$/.exec(profile)?.[1]
    if (!route || !repeats || repeats === 'none') continue
    for (const match of repeats.matchAll(/([^,]+?)\(x\d+\)(?:,|$)/g)) {
      if (match[1]) observed.add(`${route}\0${match[1]}`)
    }
  }
  return observed
}
