import type { TransactionQuery } from '@data-stores/psql'
import type { PostPublicationFootprint, PostPublicationScope } from './types.mts'
import { retainPostPublicationPostScopeContext } from './capture-post-context.mts'
import { retainCurrentRssFeedPublicationKeys } from './capture-rss-feeds.mts'
import {
  retainPostPublicationKeys,
  type PostPublicationRetainedKey,
  type UuidKeyKind,
} from './retained-key-writes.mts'

export {
  POST_PUBLICATION_DIRTY_WORK_KEY_KINDS,
  retainPostPublicationKeys,
  type PostPublicationRetainedKey,
} from './retained-key-writes.mts'
export async function retainPostPublicationImpactKeys(
  query: TransactionQuery,
  dirtyWorkId: string,
  impacts: {
    postIds?: readonly string[]
    topicIds?: readonly string[]
    communityIds?: readonly string[]
    rssFeedItemIds?: readonly string[]
  },
): Promise<void> {
  const keys: PostPublicationRetainedKey[] = [
    ...uniqueIds(impacts.postIds).map(uuidValue => ({ kind: 'impact_post' as const, uuidValue })),
    ...uniqueIds(impacts.topicIds).map(uuidValue => ({ kind: 'impact_topic' as const, uuidValue })),
    ...uniqueIds(impacts.communityIds).map(uuidValue => ({
      kind: 'impact_community' as const,
      uuidValue,
    })),
    ...uniqueIds(impacts.rssFeedItemIds).map(uuidValue => ({
      kind: 'impact_rss_feed_item' as const,
      uuidValue,
    })),
  ]
  await retainPostPublicationKeys(query, dirtyWorkId, keys)
}
export async function retainPostPublicationFootprintKeys(
  query: TransactionQuery,
  dirtyWorkId: string,
  footprint: PostPublicationFootprint | undefined,
): Promise<void> {
  if (!footprint) return
  const keys: PostPublicationRetainedKey[] = []
  addUuidKey(keys, 'identity_author', footprint.priorAuthorUserId)
  addTextKey(keys, 'identity_author_username', footprint.priorAuthorUsername)
  addUuidKey(keys, 'identity_community', footprint.priorCommunityId)
  addUuidKey(keys, 'impact_post', footprint.priorRootId)
  addTextKey(keys, 'identity_post_slug', footprint.priorPostSlug)
  addTextKey(keys, 'identity_community_slug', footprint.priorCommunitySlug)
  if (footprint.priorSitemapTarget) {
    keys.push({
      kind: 'sitemap_target',
      postType: footprint.priorSitemapTarget.postType,
      day: footprint.priorSitemapTarget.day,
    })
  }
  await retainPostPublicationKeys(query, dirtyWorkId, keys)
}
export async function retainPostPublicationTopicAliasIdentity(
  query: TransactionQuery,
  dirtyWorkId: string,
  alias: string,
): Promise<void> {
  await retainPostPublicationKeys(query, dirtyWorkId, [
    { kind: 'identity_topic_alias', textValue: alias },
  ])
}
export async function retainCurrentPostPublicationKeys(
  query: TransactionQuery,
  dirtyWorkId: string,
  scope: PostPublicationScope,
): Promise<void> {
  const keys: PostPublicationRetainedKey[] = []
  switch (scope.type) {
    case 'author':
      addUuidKey(keys, 'identity_author', scope.authorUserId)
      break
    case 'community':
      addUuidKey(keys, 'identity_community', scope.communityId)
      break
    case 'rss_feed':
      await retainCurrentRssFeedPublicationKeys(query, [
        { id: dirtyWorkId, rss_feed_id: scope.rssFeedId },
      ])
      return
    case 'post':
      await retainCurrentPostScopeKeys(query, dirtyWorkId, scope.postId)
      return
    default:
      break
  }
  if (scope.type === 'community') {
    const { rows } = await query<{ slug: string | null }>(
      `/* getCurrentCommunityPublicationKeys */ SELECT slug FROM communities WHERE id = $1`,
      [scope.communityId],
    )
    addTextKey(keys, 'identity_community_slug', rows[0]?.slug ?? undefined)
  }
  await retainPostPublicationKeys(query, dirtyWorkId, keys)
}
async function retainCurrentPostScopeKeys(
  query: TransactionQuery,
  dirtyWorkId: string,
  postId: string,
): Promise<void> {
  await retainPostPublicationPostScopeContext(query, [{ dirtyWorkId, postId }])
}
function addUuidKey(
  keys: PostPublicationRetainedKey[],
  kind: UuidKeyKind,
  uuidValue: string | undefined,
): void {
  if (uuidValue) keys.push({ kind, uuidValue })
}
function addTextKey(
  keys: PostPublicationRetainedKey[],
  kind:
    | 'identity_author_username'
    | 'identity_post_slug'
    | 'identity_community_slug'
    | 'identity_topic_alias',
  textValue: string | undefined,
): void {
  if (textValue) keys.push({ kind, textValue })
}
function uniqueIds(ids: readonly string[] | undefined): string[] {
  if (!ids) return []
  if (ids.some(id => typeof id !== 'string' || id.length === 0))
    throw new TypeError('Post publication impact keys must be identifiers')
  return [...new Set(ids)]
}
