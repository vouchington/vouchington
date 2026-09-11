import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import type { TrackedDayRange } from './types.mts'

const TRACKED_RANGE_CACHE_KEY = 'sitemaps:posts:tracked-range:v1'
const upsertTrackedDayRangeScript = registerScript(
  loadScript('upsert-tracked-day-range.lua', import.meta.url),
)

export type TrackedDayRangeUpdate = {
  previousRange: TrackedDayRange | null
  nextRange: TrackedDayRange
}

export async function getTrackedDayRangeFromCache(): Promise<TrackedDayRange | null> {
  const cached = await cacheValkeyClient.get(TRACKED_RANGE_CACHE_KEY)
  if (!cached) return null

  try {
    return toTrackedDayRange(JSON.parse(cached as string) as Partial<TrackedDayRange>)
  } catch {
    return null
  }
}

export async function setTrackedDayRangeCache(range: TrackedDayRange): Promise<void> {
  await cacheValkeyClient.set(TRACKED_RANGE_CACHE_KEY, JSON.stringify(range))
}

export async function updateTrackedDayRangeCache(
  day: string,
  fallbackRange?: TrackedDayRange | null,
): Promise<TrackedDayRangeUpdate | null> {
  const result = await cacheValkeyClient.invokeScript(upsertTrackedDayRangeScript, {
    keys: [TRACKED_RANGE_CACHE_KEY],
    args: fallbackRange === undefined ? [day] : [day, JSON.stringify(fallbackRange)],
  })

  if (typeof result !== 'string') return null

  const parsed = JSON.parse(result) as {
    previousRange?: Partial<TrackedDayRange> | null
    nextRange?: Partial<TrackedDayRange> | null
  }
  const previousRange = toTrackedDayRange(parsed.previousRange ?? null)
  const nextRange = toTrackedDayRange(parsed.nextRange ?? null)
  if (!nextRange) {
    throw new Error('Failed to update tracked day range cache')
  }

  return { previousRange, nextRange }
}

function toTrackedDayRange(value: Partial<TrackedDayRange> | null): TrackedDayRange | null {
  if (!value?.earliestDay || !value.latestDay) {
    return null
  }

  return {
    earliestDay: value.earliestDay,
    latestDay: value.latestDay,
  }
}
