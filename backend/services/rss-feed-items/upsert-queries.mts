import type { RssFeedItemWithHash } from './upsert-prepare.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { buildUpsertRssFeedItemsQuery } from './upsert-content-query.mts'
import { buildRssFeedItemSourcesQuery, type RssFeedItemSourceInput } from './upsert-sources.mts'
import type { LockedRssFeedItemRow } from './upsert-write-locks.mts'

export type ExistingRssFeedItemRow = {
  id: string
  guid: string
  url_id: string
  bedrock_nova_multimodal_v1_content_sha256: Buffer | null
  media_star_rating: unknown
  media_statistics: unknown
  chapters_url: string | null
  chapters_type: string | null
  iso_date: string | null
  pub_date: string | null
  player_url: string | null
  media_type: string | null
  video_id: string | null
  video_platform: string | null
  has_embedding: boolean
  is_linked_to_current_feed: boolean
  has_eligible_source: boolean
  published_at: Date
}

export type UpsertedRssFeedItemRow = {
  id: string
  guid: string
  url_id: string
  story_id: string | null
  has_embedding: boolean
  published_at: Date
}

type UpsertedRssFeedItemContentRow = Omit<UpsertedRssFeedItemRow, 'guid'>
type ExistingRssFeedItemMapValue = {
  id: string
  guid: string
  url_id: string
  content_sha256: Buffer | null
  media_star_rating: unknown
  media_statistics: unknown
  chapters_url: string | null
  chapters_type: string | null
  iso_date: string | null
  pub_date: string | null
  player_url: string | null
  media_type: string | null
  video_id: string | null
  video_platform: string | null
  has_embedding: boolean
}

export function buildExistingRssFeedItemsMap(
  rows: ExistingRssFeedItemRow[],
): Map<string, ExistingRssFeedItemMapValue> {
  const existing = new Map<string, ExistingRssFeedItemMapValue>()
  for (const row of rows) {
    existing.set(row.guid, {
      id: row.id,
      guid: row.guid,
      url_id: row.url_id,
      content_sha256: row.bedrock_nova_multimodal_v1_content_sha256,
      media_star_rating: row.media_star_rating,
      media_statistics: row.media_statistics,
      chapters_url: row.chapters_url,
      chapters_type: row.chapters_type,
      iso_date: row.iso_date,
      pub_date: row.pub_date,
      player_url: row.player_url,
      media_type: row.media_type,
      video_id: row.video_id,
      video_platform: row.video_platform,
      has_embedding: row.has_embedding,
    })
  }
  return existing
}

export function getRssFeedItemsToUpsert(
  itemsWithHashes: RssFeedItemWithHash[],
  existingMap: ReturnType<typeof buildExistingRssFeedItemsMap>,
): RssFeedItemWithHash[] {
  const uniqueItems = new Map<string, RssFeedItemWithHash>()
  for (const item of itemsWithHashes) uniqueItems.set(item.feedItem.guid, item)
  const itemsToUpsert: RssFeedItemWithHash[] = []
  for (const item of uniqueItems.values()) {
    if (rssFeedItemNeedsUpsert(item, existingMap)) itemsToUpsert.push(item)
  }
  return itemsToUpsert
}

function rssFeedItemNeedsUpsert(
  item: RssFeedItemWithHash,
  existingMap: ReturnType<typeof buildExistingRssFeedItemsMap>,
): boolean {
  const existing = existingMap.get(item.feedItem.guid)
  if (!existing) return true
  if (!existing.content_sha256) return true
  if (existing.url_id !== item.url_id) return true
  if (jsonValueChanged(existing.media_star_rating, item.feedItem['media:starRating'])) return true
  if (jsonValueChanged(existing.media_statistics, item.feedItem['media:statistics'])) return true
  if (nullableStringChanged(existing.chapters_url, item.feedItem.chapters_url)) return true
  if (nullableStringChanged(existing.chapters_type, item.feedItem.chapters_type)) return true
  if (nullableStringChanged(existing.iso_date, item.feedItem.isoDate)) return true
  if (nullableStringChanged(existing.pub_date, item.feedItem.pubDate)) return true
  if (nullableStringChanged(existing.player_url, item.feedItem.player_url)) return true
  if (existing.media_type !== (item.feedItem.media_type ?? 'article')) return true
  if (nullableStringChanged(existing.video_id, item.feedItem.video_id)) return true
  if (nullableStringChanged(existing.video_platform, item.feedItem.video_platform)) return true
  return Buffer.compare(existing.content_sha256, item.content_sha256) !== 0
}

function nullableStringChanged(previous: string | null, next: string | undefined) {
  return previous !== (next ?? null)
}

function jsonValueChanged(previous: unknown, next: unknown) {
  return JSON.stringify(canonicalJson(previous)) !== JSON.stringify(canonicalJson(next))
}

function canonicalJson(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (Array.isArray(value)) {
    const canonical: unknown[] = []
    for (const entry of value) canonical.push(canonicalJson(entry))
    return canonical
  }
  if (typeof value !== 'object') return value
  const entries: Array<[string, unknown]> = []
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry !== undefined) entries.push([key, canonicalJson(entry)])
  }
  entries.sort(compareCanonicalJsonKeys)
  return Object.fromEntries(entries)
}

function compareCanonicalJsonKeys(left: [string, unknown], right: [string, unknown]): number {
  return left[0].localeCompare(right[0])
}

export async function upsertRssFeedItemContent(
  txQuery: TransactionQuery,
  identityRows: Array<{ id: string; guid: string }>,
  itemsToUpsert: RssFeedItemWithHash[],
) {
  const identityIdsByGuid = new Map<string, string>()
  const identityGuidsById = new Map<string, string>()
  for (const row of identityRows) {
    identityIdsByGuid.set(row.guid, row.id)
    identityGuidsById.set(row.id, row.guid)
  }
  const query = buildUpsertRssFeedItemsQuery(identityIdsByGuid, itemsToUpsert)
  const { rows } = await txQuery<UpsertedRssFeedItemContentRow>(query.text, query.values)
  const upserted: Array<UpsertedRssFeedItemContentRow & { guid: string }> = []
  for (const row of rows) upserted.push({ ...row, guid: identityGuidsById.get(row.id)! })
  return upserted
}

export function getRevisedStoryIds(
  lockedRows: Iterable<LockedRssFeedItemRow>,
  upsertedRows: Array<Pick<UpsertedRssFeedItemContentRow, 'id' | 'url_id' | 'story_id'>>,
): string[] {
  const lockedRowsById = new Map<string, LockedRssFeedItemRow>()
  for (const row of lockedRows) lockedRowsById.set(row.id, row)
  const storyIds: string[] = []
  for (const row of upsertedRows) {
    const previous = lockedRowsById.get(row.id)
    if (previous?.url_id !== row.url_id && row.story_id) storyIds.push(row.story_id)
  }
  return storyIds
}

export async function upsertRssFeedItemSources(
  txQuery: TransactionQuery,
  rssFeedId: string,
  rows: RssFeedItemSourceInput[],
) {
  if (rows.length === 0) return []
  const sourceQuery = buildRssFeedItemSourcesQuery(rssFeedId, rows)
  const { rows: insertedRows } = await txQuery<{ rss_feed_item_id: string }>(
    sourceQuery.text,
    sourceQuery.values,
  )
  return insertedRows
}
