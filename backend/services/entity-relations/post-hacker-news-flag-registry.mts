import type { QueryOptions } from '@data-stores/psql/types'

type RecomputePostFlags = (postIds: readonly string[], options: QueryOptions) => Promise<void>
let recompute: RecomputePostFlags | undefined

/** Registered by the post service at startup to preserve post write ownership. */
export function registerPostHackerNewsFlagRecompute(callback: RecomputePostFlags): void {
  recompute = callback
}

export function recomputeRegisteredPostHackerNewsFlags(
  postIds: readonly string[],
  options: QueryOptions,
): Promise<void> {
  if (!postIds.length) return Promise.resolve()
  if (!recompute) throw new Error('Post Hacker News flag recomputation is not registered')
  return recompute(postIds, options)
}
