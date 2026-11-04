import { isPostTimeRange, type PostTimeRange } from '@/lib/posts/time-range'

export type HackerNewsConfig = { references_visible: boolean; post_time_range_cap: PostTimeRange }
export const HIDDEN_HACKER_NEWS_CONFIG: HackerNewsConfig = {
  references_visible: false,
  post_time_range_cap: '1y',
}
export function parseHackerNewsConfig(value: {
  references_visible: unknown
  post_time_range_cap: unknown
}): HackerNewsConfig {
  return {
    references_visible: value.references_visible === true,
    post_time_range_cap: isPostTimeRange(value.post_time_range_cap)
      ? value.post_time_range_cap
      : '1y',
  }
}
