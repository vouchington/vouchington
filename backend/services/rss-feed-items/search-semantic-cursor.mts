import { createHash } from 'node:crypto'
import { decodeUuidCursor, hasExactKeys, isPreciseTimestampString } from '@modules/pagination'
import { normalizeSearchEmbeddingQuery } from '@services/bedrock-embeddings/search/get-cached'
import createHttpError from 'http-errors'
import type { SearchRssFeedItemsOptions } from './search.mts'

export type SemanticRssFeedItemCursor = {
  ranking_score: number
  published_at: string
  id: string
  scope: string
}

export function getSemanticRssFeedItemCursor(
  after: string | undefined,
  options: SearchRssFeedItemsOptions,
): SemanticRssFeedItemCursor | null {
  if (!after) return null
  const cursor = decodeUuidCursor(
    after,
    isSemanticRssFeedItemCursor,
    'Invalid semantic search cursor',
  )
  if (cursor.scope !== getSemanticRssFeedItemCursorScope(options)) {
    throw createHttpError(400, 'Invalid semantic search cursor')
  }
  return cursor
}

export function getSemanticRssFeedItemCursorScope(options: SearchRssFeedItemsOptions): string {
  const viewerDependent = options.read !== undefined || options.has_related_posts !== undefined
  const scope = {
    resource: 'rss-feed-items-semantic-search',
    version: 1,
    order: 'ranking_score:desc,published_at:desc,id:desc',
    query: normalizeSearchEmbeddingQuery(options.semantic_search_query ?? ''),
    rss_feed_ids: normalizeArray(options.rss_feed_ids),
    topic_ids: normalizeArray(options.topic_ids),
    category_topic_ids: normalizeArray(options.category_topic_ids),
    hashtag_topic_ids: normalizeArray(options.hashtag_topic_ids),
    hashtag_alias_ids: normalizeArray(options.hashtag_alias_ids),
    media_types: normalizeArray(options.media_types),
    story_id: options.story_id ?? null,
    has_related_posts: options.has_related_posts ?? null,
    read: options.currentUserId ? (options.read ?? null) : null,
    viewer: viewerDependent && options.currentUserId ? options.currentUserId : null,
    administrator:
      viewerDependent && options.currentUserId ? (options.isAdministrator ?? false) : null,
  }
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex')
}

function isSemanticRssFeedItemCursor(cursor: unknown): cursor is SemanticRssFeedItemCursor {
  if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) return false
  const value = cursor as Record<string, unknown>
  return (
    hasExactKeys(value, ['ranking_score', 'published_at', 'id', 'scope']) &&
    typeof value.ranking_score === 'number' &&
    Number.isFinite(value.ranking_score) &&
    typeof value.published_at === 'string' &&
    isPreciseTimestampString(value.published_at) &&
    typeof value.id === 'string' &&
    typeof value.scope === 'string'
  )
}

function normalizeArray(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort()
}
