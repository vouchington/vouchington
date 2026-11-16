import { createHash } from 'node:crypto'
import type { PublicationCapturedKey } from '@voucha/types/post-publication'
import type { PostPublicationChange } from './types.mts'
import { getPostPublicationWorkLimit } from './work-limits.mts'

export type { PublicationCapturedKey } from '@voucha/types/post-publication'

/** Captures the caller's pre-mutation footprint without requiring retained PostgreSQL rows. */
export function capturedPublicationKeys(change: PostPublicationChange): PublicationCapturedKey[] {
  const footprint = change.footprint
  const keys: PublicationCapturedKey[] = [
    ...impactPublicationKeys({
      postIds: change.impactedPostIds,
      topicIds: change.impactedTopicIds,
      communityIds: change.impactedCommunityIds,
      rssFeedItemIds: change.impactedRssFeedItemIds,
    }),
    ...(footprint
      ? [
          ...uuidKey('identity_author', footprint.priorAuthorUserId),
          ...textKey('identity_author_username', footprint.priorAuthorUsername),
          ...uuidKey('identity_community', footprint.priorCommunityId),
          ...(footprint.priorRssFeedIds ?? []).flatMap(rssFeedId =>
            uuidKey('identity_rss_feed', rssFeedId),
          ),
          ...uuidKey('impact_post', footprint.priorRootId),
          ...textKey('identity_post_slug', footprint.priorPostSlug),
          ...textKey('identity_community_slug', footprint.priorCommunitySlug),
          ...(footprint.priorSitemapTarget
            ? [{ kind: 'sitemap_target' as const, ...footprint.priorSitemapTarget }]
            : []),
        ]
      : []),
    ...(change.scope.type === 'author'
      ? uuidKey('identity_author', change.scope.authorUserId)
      : []),
    ...(change.scope.type === 'community'
      ? uuidKey('identity_community', change.scope.communityId)
      : []),
    ...(change.scope.type === 'rss_feed'
      ? uuidKey('identity_rss_feed', change.scope.rssFeedId)
      : []),
    ...textKey('identity_topic_alias', change.topicAliasText),
  ]
  return uniquePublicationKeys(keys)
}

export function impactPublicationKeys(impacts: {
  postIds?: readonly string[]
  topicIds?: readonly string[]
  communityIds?: readonly string[]
  rssFeedItemIds?: readonly string[]
}): PublicationCapturedKey[] {
  return [
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
}

export function uniquePublicationKeys(
  keys: readonly PublicationCapturedKey[],
): PublicationCapturedKey[] {
  const seen = new Set<string>()
  return keys.filter(key => {
    const value =
      'uuidValue' in key
        ? key.uuidValue.toLowerCase()
        : 'textValue' in key
          ? key.textValue
          : `${key.postType}:${key.day}`
    const signature = `${key.kind}:${value}`
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

/** Stable across capture order and duplicate source rows. */
export function hashCapturedPublicationKeys(keys: readonly PublicationCapturedKey[]): string {
  const canonical = uniquePublicationKeys(keys)
    .map(key =>
      JSON.stringify(
        'uuidValue' in key
          ? [key.kind, key.uuidValue.toLowerCase()]
          : 'textValue' in key
            ? [key.kind, key.textValue]
            : [key.kind, key.postType, key.day],
      ),
    )
    .toSorted()
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

/** Bounds each Glide payload while keeping the captured preimage immutable after commit. */
export function splitCapturedPublicationKeys(
  keys: readonly PublicationCapturedKey[],
): PublicationCapturedKey[][] {
  const unique = uniquePublicationKeys(keys)
  const limit = Math.min(
    getPostPublicationWorkLimit('effect_payload_key_batch_size'),
    getPostPublicationWorkLimit('capture_batch_size'),
  )
  if (unique.length === 0) return [[]]
  const pages: PublicationCapturedKey[][] = []
  for (let offset = 0; offset < unique.length; offset += limit)
    pages.push(unique.slice(offset, offset + limit))
  return pages
}

function uuidKey(
  kind: Extract<PublicationCapturedKey, { uuidValue: string }>['kind'],
  uuidValue: string | undefined,
): PublicationCapturedKey[] {
  return uuidValue ? [{ kind, uuidValue }] : []
}

function textKey(
  kind: Extract<PublicationCapturedKey, { textValue: string }>['kind'],
  textValue: string | undefined,
): PublicationCapturedKey[] {
  return textValue ? [{ kind, textValue }] : []
}

function uniqueIds(ids: readonly string[] | undefined): string[] {
  if (!ids) return []
  if (ids.some(id => typeof id !== 'string' || id.length === 0))
    throw new TypeError('Post publication impact keys must be identifiers')
  return [...new Set(ids)]
}
