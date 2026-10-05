import type {
  ClaimedPostPublicationDirtyWork,
  PostPublicationScope,
} from '@services/post-publication'

export function postPublicationScopeForWork(
  work: ClaimedPostPublicationDirtyWork,
): PostPublicationScope {
  if (work.post_identity_id) return { type: 'post', postId: work.post_identity_id }
  if (work.author_identity_id) return { type: 'author', authorUserId: work.author_identity_id }
  if (work.community_identity_id)
    return { type: 'community', communityId: work.community_identity_id }
  if (work.rss_feed_identity_id) return { type: 'rss_feed', rssFeedId: work.rss_feed_identity_id }
  if (work.topic_alias_identity_id)
    return { type: 'topic_alias', topicAliasId: work.topic_alias_identity_id }
  if (work.story_identity_id) return { type: 'story', storyId: work.story_identity_id }
  throw new TypeError('Post publication dirty work requires a scope')
}
