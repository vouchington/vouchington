/**
 * Time ranges a post list offers. Values are the API's `time_range` codes; labels live in the
 * select component. The API searches 30 days when a client sends none.
 */
export const POST_TIME_RANGES = ['1w', '1m', '1y', 'all'] as const

export type PostTimeRange = (typeof POST_TIME_RANGES)[number]

export const DEFAULT_POST_TIME_RANGE: PostTimeRange = '1m'

export function isPostTimeRange(value: unknown): value is PostTimeRange {
  return POST_TIME_RANGES.some(range => range === value)
}

/** The `time_range` query param for a page's search params; empty when absent or unsupported. */
export function postTimeRangeParams(value: string | string[] | undefined): {
  time_range?: PostTimeRange
} {
  return isPostTimeRange(value) ? { time_range: value } : {}
}
