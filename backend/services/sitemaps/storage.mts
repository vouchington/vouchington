import { open } from 'node:fs/promises'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { S3Buckets, S3ImagesClient } from '@modules/aws'
import type { SitemapFamilyType, SitemapPostType, TrackedDayRange } from './types.mts'
import { buildFamilyMetaStorageKey, buildPostDayMetaStorageKey } from './generated-paths.mts'
import { applyStoragePrefix } from './storage-prefix.mts'
import {
  getTrackedDayRangeFromCache,
  setTrackedDayRangeCache,
  updateTrackedDayRangeCache,
} from './tracked-range-cache.mts'
import { findTrackedDayRangeFromS3 } from './tracked-range-discovery.mts'

const TRACKED_RANGE_STORAGE_KEY = 'sitemaps/meta/posts-tracked-range.json'
export type PostDayManifest = {
  active_page_count: number
  highest_written_page: number
  generated_at: string
  content_hashes: Record<string, string>
}
export type SitemapFamilyManifest = PostDayManifest

async function putSitemapObject(
  key: string,
  body: string | Uint8Array,
  options: {
    contentType: string
    contentEncoding?: string
  },
): Promise<void> {
  await S3ImagesClient.send(
    new PutObjectCommand({
      Bucket: S3Buckets.sitemaps,
      Key: applyStoragePrefix(key),
      Body: body,
      ContentType: options.contentType,
      ...(options.contentEncoding ? { ContentEncoding: options.contentEncoding } : {}),
    }),
  )
}

export async function putSitemapObjectFile(
  key: string,
  filePath: string,
  options: {
    contentType: string
    contentEncoding?: string
  },
): Promise<void> {
  await using fileHandle = await open(filePath, 'r')
  await S3ImagesClient.send(
    new PutObjectCommand({
      Bucket: S3Buckets.sitemaps,
      Key: applyStoragePrefix(key),
      Body: fileHandle.createReadStream(),
      ContentType: options.contentType,
      ...(options.contentEncoding ? { ContentEncoding: options.contentEncoding } : {}),
    }),
  )
}

export function getPostDayManifest(
  postType: SitemapPostType,
  day: string,
): Promise<PostDayManifest | null> {
  return getJsonObject<PostDayManifest>(buildPostDayMetaStorageKey(postType, day))
}

export async function putPostDayManifest(
  postType: SitemapPostType,
  day: string,
  manifest: PostDayManifest,
): Promise<void> {
  await putSitemapObject(buildPostDayMetaStorageKey(postType, day), JSON.stringify(manifest), {
    contentType: 'application/json; charset=utf-8',
  })
}

export function getSitemapFamilyManifest(
  family: SitemapFamilyType,
): Promise<SitemapFamilyManifest | null> {
  return getJsonObject<SitemapFamilyManifest>(buildFamilyMetaStorageKey(family))
}

export async function putSitemapFamilyManifest(
  family: SitemapFamilyType,
  manifest: SitemapFamilyManifest,
): Promise<void> {
  await putSitemapObject(buildFamilyMetaStorageKey(family), JSON.stringify(manifest), {
    contentType: 'application/json; charset=utf-8',
  })
}

export async function getTrackedDayRange(): Promise<TrackedDayRange | null> {
  const cached = await getTrackedDayRangeFromCache()
  if (cached) return cached

  const range = await getTrackedDayRangeFromDurableStorage()
  if (!range) return null

  await setTrackedDayRangeCache(range)
  return range
}

export async function markTrackedDay(day: string): Promise<TrackedDayRange> {
  let update = await updateTrackedDayRangeCache(day)
  if (!update) {
    const fallbackRange = await getTrackedDayRangeFromDurableStorage()
    update = await updateTrackedDayRangeCache(day, fallbackRange)
  }
  if (!update) {
    throw new Error('Failed to update tracked day range cache')
  }

  const { previousRange, nextRange } = update
  if (previousRange && isSameTrackedDayRange(previousRange, nextRange)) {
    return previousRange
  }

  await persistTrackedDayRange(nextRange)
  return nextRange
}

async function getTrackedDayRangeFromDurableStorage(): Promise<TrackedDayRange | null> {
  const persisted = await getTrackedDayRangeFromStorage()
  const discovered = await findTrackedDayRangeFromS3()
  const range = mergeTrackedDayRanges(persisted, discovered)
  if (!range) return null

  if (!persisted || !isSameTrackedDayRange(persisted, range)) {
    await persistTrackedDayRange(range)
  }
  return range
}

async function getTrackedDayRangeFromStorage(): Promise<TrackedDayRange | null> {
  return toTrackedDayRange(await getJsonObject<Partial<TrackedDayRange>>(TRACKED_RANGE_STORAGE_KEY))
}

async function persistTrackedDayRange(range: TrackedDayRange): Promise<void> {
  await putSitemapObject(TRACKED_RANGE_STORAGE_KEY, JSON.stringify(range), {
    contentType: 'application/json; charset=utf-8',
  })
}

async function getJsonObject<T>(key: string): Promise<T | null> {
  try {
    const response = await S3ImagesClient.send(
      new GetObjectCommand({
        Bucket: S3Buckets.sitemaps,
        Key: applyStoragePrefix(key),
      }),
    )
    const body = await response.Body?.transformToString()
    if (!body) return null
    return JSON.parse(body) as T
  } catch (error) {
    if (isMissingS3ObjectError(error)) return null
    throw error
  }
}

function isMissingS3ObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const maybeStatus = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode
  return error.name === 'NoSuchKey' || maybeStatus === 404
}

function mergeTrackedDayRanges(
  left: TrackedDayRange | null,
  right: TrackedDayRange | null,
): TrackedDayRange | null {
  if (!left) return right
  if (!right) return left

  return {
    earliestDay: left.earliestDay < right.earliestDay ? left.earliestDay : right.earliestDay,
    latestDay: left.latestDay > right.latestDay ? left.latestDay : right.latestDay,
  }
}

function isSameTrackedDayRange(left: TrackedDayRange, right: TrackedDayRange): boolean {
  return left.earliestDay === right.earliestDay && left.latestDay === right.latestDay
}

function toTrackedDayRange(value: Partial<TrackedDayRange> | null): TrackedDayRange | null {
  if (!value?.earliestDay || !value.latestDay) {
    return null
  }

  return {
    earliestDay: value.earliestDay,
    latestDay: value.latestDay,
  }
}
