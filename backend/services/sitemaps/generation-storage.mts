import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { S3Buckets, S3ImagesClient } from '@modules/aws'
import {
  buildFamilyProgressStorageKey,
  buildPostDayProgressStorageKey,
} from './generated-paths.mts'
import { applyStoragePrefix, stripStoragePrefix } from './storage-prefix.mts'
import { getJsonObject, putSitemapObject } from './storage.mts'
import type { SitemapFamilyType, SitemapPostType } from './types.mts'

export type SitemapGenerationProgress = {
  generation_id: string
  started_at: string
  content_hash: string
  high_water_id: string | null
  after_id: string | null
  after_path: string | null
  page_count: number
  finished: boolean
  previous_generation_id: string | null
  previous_page_count: number
}
export type RetiredSitemapGeneration = {
  generation_id: string
  page_prefix: string
  page_count: number
  next_page: number
  retire_after: string
}

const RETIRED_RECORD_PREFIX = 'sitemaps/retired/records/'
const RETIRED_CURSOR_KEY = 'sitemaps/retired/_cursor.json'

export async function deleteSitemapObject(key: string): Promise<void> {
  await S3ImagesClient.send(
    new DeleteObjectCommand({ Bucket: S3Buckets.sitemaps, Key: applyStoragePrefix(key) }),
  )
}

export async function deleteSitemapObjects(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  if (keys.length > 1000) throw new Error('Sitemap delete exceeds the S3 batch limit')
  const result = await S3ImagesClient.send(
    new DeleteObjectsCommand({
      Bucket: S3Buckets.sitemaps,
      Delete: { Objects: keys.map(key => ({ Key: applyStoragePrefix(key) })) },
    }),
  )
  if (result.Errors?.length) throw new Error('Sitemap object deletion was incomplete')
}

export async function putRetiredSitemapGeneration(record: RetiredSitemapGeneration): Promise<void> {
  await putSitemapObject(
    `${RETIRED_RECORD_PREFIX}${record.generation_id}.json`,
    JSON.stringify(record),
    {
      contentType: 'application/json; charset=utf-8',
    },
  )
}

export function getRetiredSitemapGeneration(key: string): Promise<RetiredSitemapGeneration | null> {
  if (!key.startsWith(RETIRED_RECORD_PREFIX)) throw new Error('Invalid sitemap retirement key')
  return getJsonObject<RetiredSitemapGeneration>(key)
}

export function deleteRetiredSitemapGeneration(key: string): Promise<void> {
  if (!key.startsWith(RETIRED_RECORD_PREFIX)) throw new Error('Invalid sitemap retirement key')
  return deleteSitemapObject(key)
}

export async function listRetiredSitemapGenerationKeys(
  afterKey: string | null,
  limit: number,
): Promise<{ keys: string[]; hasMore: boolean }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('Invalid sitemap retirement listing limit')
  }
  const result = await S3ImagesClient.send(
    new ListObjectsV2Command({
      Bucket: S3Buckets.sitemaps,
      Prefix: applyStoragePrefix(RETIRED_RECORD_PREFIX),
      ...(afterKey ? { StartAfter: applyStoragePrefix(afterKey) } : {}),
      MaxKeys: limit,
    }),
  )
  const prefix = applyStoragePrefix(RETIRED_RECORD_PREFIX)
  const keys = (result.Contents ?? []).map(object => {
    const key = object.Key
    if (!key?.startsWith(prefix)) throw new Error('Sitemap retirement listing escaped its prefix')
    return stripStoragePrefix(key)
  })
  return { keys, hasMore: result.IsTruncated === true }
}

export async function getRetiredSitemapCursor(): Promise<string | null> {
  const value = await getJsonObject<{ after_key: string | null }>(RETIRED_CURSOR_KEY)
  return value?.after_key ?? null
}

export async function putRetiredSitemapCursor(afterKey: string | null): Promise<void> {
  await putSitemapObject(RETIRED_CURSOR_KEY, JSON.stringify({ after_key: afterKey }), {
    contentType: 'application/json; charset=utf-8',
  })
}

export function getPostDayProgress(
  postType: SitemapPostType,
  day: string,
): Promise<SitemapGenerationProgress | null> {
  return getJsonObject<SitemapGenerationProgress>(buildPostDayProgressStorageKey(postType, day))
}

export async function putPostDayProgress(
  postType: SitemapPostType,
  day: string,
  progress: SitemapGenerationProgress,
): Promise<void> {
  await putSitemapObject(buildPostDayProgressStorageKey(postType, day), JSON.stringify(progress), {
    contentType: 'application/json; charset=utf-8',
  })
}

export function deletePostDayProgress(postType: SitemapPostType, day: string): Promise<void> {
  return deleteSitemapObject(buildPostDayProgressStorageKey(postType, day))
}

export function getSitemapFamilyProgress(
  family: SitemapFamilyType,
): Promise<SitemapGenerationProgress | null> {
  return getJsonObject<SitemapGenerationProgress>(buildFamilyProgressStorageKey(family))
}

export async function putSitemapFamilyProgress(
  family: SitemapFamilyType,
  progress: SitemapGenerationProgress,
): Promise<void> {
  await putSitemapObject(buildFamilyProgressStorageKey(family), JSON.stringify(progress), {
    contentType: 'application/json; charset=utf-8',
  })
}

export function deleteSitemapFamilyProgress(family: SitemapFamilyType): Promise<void> {
  return deleteSitemapObject(buildFamilyProgressStorageKey(family))
}
