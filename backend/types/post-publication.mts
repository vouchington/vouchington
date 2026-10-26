/** Queue-safe captured values from one committed publication change. */
export type PublicationCapturedKey =
  | {
      kind:
        | 'impact_post'
        | 'impact_topic'
        | 'impact_community'
        | 'impact_rss_feed_item'
        | 'identity_author'
        | 'identity_community'
        | 'identity_rss_feed'
      uuidValue: string
    }
  | {
      kind:
        | 'identity_author_username'
        | 'identity_post_slug'
        | 'identity_community_slug'
        | 'identity_topic_alias'
      textValue: string
    }
  | { kind: 'sitemap_target'; postType: string; day: string }

export type PostPublicationEffectsJobData = {
  /** Generated once for the producer's logical capture; unchanged on enqueue and job retries. */
  changeId: string
  /** A post job has a real post ID; a scope-only effect has no invented post ID. */
  postId: string | null
  scope: {
    type: 'post' | 'author' | 'community' | 'rss_feed' | 'topic_alias' | 'story' | 'topic'
    id: string
  }
  reason: string
  keys: PublicationCapturedKey[]
  keyHash: string
  chunkIndex: number
  /** One bounded live-identity page in a stable child chain of the captured change. */
  continuation?: {
    kind:
      | 'post_slugs'
      | 'topic_aliases'
      | 'post_data_topics'
      | 'post_review_topics'
      | 'post_topic_relations'
      | 'post_alias_relations'
      | 'post_alias_sources'
      | 'rss_feed_items'
      | 'rss_feed_categories'
      | 'rss_feed_item_categories'
      | 'topic_merge_posts'
      | 'topic_merge_feeds'
      | 'topic_merge_items'
      | 'topic_merge_item_sources'
    subjectIds: string[]
    subjectIndex: number
    after: string | null
  }
}
