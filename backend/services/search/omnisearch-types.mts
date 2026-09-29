import type { PrivateUser } from '@services/users/types'

export type OmnisearchPost = {
  id: string
  post_type: string
  title: string
  authored_title: string | null
  declared_language: string | null
  lingua_rs_detected_language: string | null
}

export type OmnisearchNewsItem = {
  id: string
  url: string
  title: string
  feed_title: string
}

export type OmnisearchOptions = {
  /** Authenticated user; controls which cached vs. live paths are used. */
  currentUser?: PrivateUser | null
  /** Plain-text portion of the query after hashtag mentions are stripped. */
  textSearchQuery?: string
  /** Topic IDs resolved from `#topic-name` mentions for verticals that support topic filtering. */
  hashtagTopicIds?: string[]
  /** Unlinked alias IDs resolved from hashtag mentions for post and news filtering. */
  hashtagAliasIds?: string[]
  /** An unresolved hashtag makes the complete AND-filtered search empty. */
  hasUnknownHashtag?: boolean
  /** Per-vertical result cap. Defaults to 3. */
  limit?: number
}
