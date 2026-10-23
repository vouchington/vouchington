import type { Post, PostMetrics } from '@services/posts/types'
import type { ElectionVote } from '@services/elections-votes/shared'
import type { ViewPostElection } from '@services/elections-votes/post'

type ElectionVotesById = Record<string, ElectionVote>
export type BookmarksById = Record<string, Record<string, boolean>>

type EntityFetchResult<TEntity, TMetrics> = {
  entities: Record<string, TEntity>
  entity_metrics: Record<string, TMetrics>
  bookmarks?: BookmarksById
  election_votes?: ElectionVotesById
}

export type PostFetchResult = EntityFetchResult<Post, PostMetrics> & {
  post_elections: Record<string, ViewPostElection>
}
