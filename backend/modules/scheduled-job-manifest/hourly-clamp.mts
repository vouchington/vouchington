import type { ScheduledJobRepeat } from './types.mts'

/**
 * Aurora Serverless v2 needs a contiguous idle window to auto-pause. Staging clamps every
 * scheduled job to fire at most once per hour so that window exists. This is a floor, not a
 * target: jobs already at or below hourly are left untouched.
 */
export const HOURLY_FLOOR_MS = 3_600_000
export const HOURLY_FLOOR_PATTERN = '0 * * * *'
export const HOURLY_FLOOR_SCHEDULE_TEXT = 'every 1h'

export type HourlyClampResult = {
  repeat: ScheduledJobRepeat
  clamped: boolean
}

/**
 * Clamps a resolved (non-thunk) repeat to at most once per hour. Only rewrites values that
 * actually exceed the floor; already-compliant values are returned unchanged (same reference)
 * so callers can cheaply detect whether a rewrite happened via the `clamped` flag.
 */
export function clampScheduledJobRepeatToHourlyFloor(
  repeat: ScheduledJobRepeat,
): HourlyClampResult {
  if ('every' in repeat) {
    const clamped = repeat.every < HOURLY_FLOOR_MS
    return { repeat: clamped ? { every: HOURLY_FLOOR_MS } : repeat, clamped }
  }
  const clamped = maxCronFiringsPerHour(repeat.pattern) > 1
  return { repeat: clamped ? { pattern: HOURLY_FLOOR_PATTERN } : repeat, clamped }
}

/**
 * Counts how many times a 5-field cron pattern (minute hour day-of-month month day-of-week) can
 * fire within a single hour. The hour/day-of-month/month/day-of-week fields only gate *whether* a
 * given hour fires at all; only the minute field determines *how many times* it fires within an
 * hour that does. So only the minute field is parsed.
 */
export function maxCronFiringsPerHour(pattern: string): number {
  const fields = pattern.trim().split(/\s+/)
  const minuteField = fields[0]
  if (fields.length !== 5 || minuteField === undefined || minuteField === '') {
    throw new Error(`Expected a 5-field cron pattern, got: ${JSON.stringify(pattern)}`)
  }
  const minutes = new Set<number>()
  for (const item of minuteField.split(',')) {
    for (const minute of expandCronMinuteItem(item)) minutes.add(minute)
  }
  return minutes.size
}

/**
 * Expands one comma-separated item of a cron minute field (`*`, a step on `*`, a bare `N`, a step
 * on `N`, a range `N-M`, or a stepped range) into the concrete minute values (0-59) it matches.
 * A step on a bare `N` follows Vixie-cron semantics: start at N, step until the field's end (59).
 */
function expandCronMinuteItem(item: string): number[] {
  const [rangePart, stepPart, ...rest] = item.split('/')
  if (rangePart === undefined || rangePart === '' || rest.length > 0) {
    throw new Error(`Invalid cron minute field item: ${JSON.stringify(item)}`)
  }

  let start: number
  let end: number
  if (rangePart === '*') {
    start = 0
    end = 59
  } else {
    const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(rangePart)
    if (rangeMatch?.[1] === undefined) {
      throw new Error(`Invalid cron minute field item: ${JSON.stringify(item)}`)
    }
    start = Number(rangeMatch[1])
    end =
      rangeMatch[2] === undefined ? (stepPart === undefined ? start : 59) : Number(rangeMatch[2])
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 59 || start > end) {
    throw new Error(`Cron minute field item out of range 0-59: ${JSON.stringify(item)}`)
  }

  const step = stepPart === undefined ? 1 : Number(stepPart)
  if (!Number.isInteger(step) || step <= 0) {
    throw new Error(`Invalid cron minute field step: ${JSON.stringify(item)}`)
  }

  const values: number[] = []
  for (let value = start; value <= end; value += step) values.push(value)
  return values
}
