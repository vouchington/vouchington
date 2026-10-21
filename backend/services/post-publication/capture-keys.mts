import type { TransactionQuery } from '@data-stores/psql'
import type { PostPublicationChange } from './types.mts'
import { retainCurrentRssFeedPublicationKeys } from './capture-rss-feeds.mts'
import {
  retainPostPublicationKeys,
  type PostPublicationRetainedKey,
  type UuidKeyKind,
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
export async function retainRecordedPublicationKeys(
  query: TransactionQuery,
  dirtyWorkId: string,
  change: PostPublicationChange,
): Promise<void> {
  const keys = recordedPublicationKeys(change)
  if (change.scope.type === 'rss_feed') {
    if (keys.length > 0) await retainPostPublicationKeys(query, dirtyWorkId, keys)
    await retainCurrentRssFeedPublicationKeys(query, [
      { id: dirtyWorkId, rss_feed_identity_id: change.scope.rssFeedId },
    ])
    return
  }
  if (change.scope.type === 'community') {
    const { rows } = await query<{ slug: string | null }>(
      `/* getCurrentCommunityPublicationKeys */ SELECT community.slug FROM post_publication_community_identities identity JOIN communities community ON community.id = identity.community_id WHERE identity.id = $1`,
      [change.scope.communityId],
    )
    addTextKey(keys, 'identity_community_slug', rows[0]?.slug ?? undefined)
  }
  if (keys.length > 0) await retainPostPublicationKeys(query, dirtyWorkId, keys)
}
function recordedPublicationKeys(change: PostPublicationChange): PostPublicationRetainedKey[] {
  const keys: PostPublicationRetainedKey[] = [
    ...uniqueIds(change.impactedPostIds).map(uuidValue => ({
      kind: 'impact_post' as const,
      uuidValue,
    })),
    ...uniqueIds(change.impactedTopicIds).map(uuidValue => ({
      kind: 'impact_topic' as const,
      uuidValue,
    })),
    ...uniqueIds(change.impactedCommunityIds).map(uuidValue => ({
      kind: 'impact_community' as const,
      uuidValue,
    })),
    ...uniqueIds(change.impactedRssFeedItemIds).map(uuidValue => ({
      kind: 'impact_rss_feed_item' as const,
      uuidValue,
    })),
  ]
  const footprint = change.footprint
  if (footprint) {
    addUuidKey(keys, 'identity_author', footprint.priorAuthorUserId)
    addTextKey(keys, 'identity_author_username', footprint.priorAuthorUsername)
    addUuidKey(keys, 'identity_community', footprint.priorCommunityId)
    addUuidKey(keys, 'impact_post', footprint.priorRootId)
    addTextKey(keys, 'identity_post_slug', footprint.priorPostSlug)
    addTextKey(keys, 'identity_community_slug', footprint.priorCommunitySlug)
  }
  if (change.scope.type === 'author') addUuidKey(keys, 'identity_author', change.scope.authorUserId)
  if (change.scope.type === 'community')
    addUuidKey(keys, 'identity_community', change.scope.communityId)
  addTextKey(keys, 'identity_topic_alias', change.topicAliasText)
  return keys
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
