import type { PostSearchOptions, PostSearchSort } from './types.mts'

export function usesTopicBestCohort(options: PostSearchOptions, sort: PostSearchSort): boolean {
  return sort === 'best' && Boolean(options.data_point_topic_ids?.length)
}

/** The same sorted lead topic drives the raw index walk and its proven membership. */
export function indexServedDataPointTopicId(
  options: PostSearchOptions,
  sort: PostSearchSort,
): string | undefined {
  if (sort !== 'new' && !usesTopicBestCohort(options, sort)) return undefined
  return options.data_point_topic_ids?.toSorted()[0]
}
