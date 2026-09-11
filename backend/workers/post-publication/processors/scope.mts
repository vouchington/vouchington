import type {
  ClaimedPostPublicationDirtyWork,
  PostPublicationScope,
} from '@services/post-publication'

export function postPublicationScopeForWork(
  work: ClaimedPostPublicationDirtyWork,
): PostPublicationScope {
  if (work.post_id) return { type: 'post', postId: work.post_id }
  if (work.author_user_id) return { type: 'author', authorUserId: work.author_user_id }
  if (work.community_id) return { type: 'community', communityId: work.community_id }
  if (work.rss_feed_id) return { type: 'rss_feed', rssFeedId: work.rss_feed_id }
  if (work.topic_alias_id) return { type: 'topic_alias', topicAliasId: work.topic_alias_id }
  if (work.story_id) return { type: 'story', storyId: work.story_id }
  throw new TypeError('Post publication dirty work requires a scope')
}
