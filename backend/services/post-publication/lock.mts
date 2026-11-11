import type { PostPublicationScope } from './types.mts'

export function postPublicationScopeIdentifier(scope: PostPublicationScope): string {
  switch (scope.type) {
    case 'post':
      return scope.postId
    case 'author':
      return scope.authorUserId
    case 'community':
      return scope.communityId
    case 'rss_feed':
      return scope.rssFeedId
    case 'topic_alias':
      return scope.topicAliasId
    case 'story':
      return scope.storyId
    case 'topic':
      return scope.topicId
  }
}
