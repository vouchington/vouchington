import { DEFAULT_POST_SEARCH_TIME_RANGE } from '@modules/feed-query-builders'
import { areHackerNewsReferencesVisible } from '@services/urls/hacker-news-visibility-config'
import type { PostSearchOptions } from './types.mts'

/** Long-window requests keep their history, using best instead of an unbounded hot ranking. */
export function normalizeHackerNewsHotSearch(options: PostSearchOptions): PostSearchOptions {
  if (
    options.sort !== 'hot' ||
    options.has_hacker_news_references !== true ||
    !areHackerNewsReferencesVisible()
  )
    return options
  const timeRange = options.time_range ?? DEFAULT_POST_SEARCH_TIME_RANGE
  return {
    ...options,
    time_range: timeRange,
    sort: timeRange === '1y' || timeRange === 'all' ? 'best' : 'hot',
  }
}

export function usesHackerNewsHotCandidates(options: PostSearchOptions): boolean {
  return (
    options.sort === 'hot' &&
    options.has_hacker_news_references === true &&
    areHackerNewsReferencesVisible()
  )
}
