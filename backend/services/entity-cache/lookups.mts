import { read, write } from '@data-stores/psql'
import { isUUID, isSlug, isUsername, normalizeUrlForUrlTable } from '@modules/utils'
import createHttpError from 'http-errors'
import { caches } from './caches.mts'
import { getTopicIdByAny, getTopicIdsByAnyBatch } from './topic-lookups.mts'

async function getUserIdByAny(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim()

  if (isUUID(trimmed)) {
    return trimmed.toLowerCase()
  }

  const normalized = trimmed.toLowerCase()
  if (!isUsername(normalized)) {
    throw createHttpError(422, `Invalid user identifier: ${identifier}`)
  }

  const { rows } = await read(
    `/* getUserIdByAny */
    SELECT id
    FROM users
    WHERE LOWER(username) = $1
      AND deleted_at IS NULL
    LIMIT 1
  `,
    [normalized],
  )
  return (rows[0]?.id as string | undefined) ?? null
}

async function getPostIdByAny(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim()

  if (isUUID(trimmed)) {
    return trimmed.toLowerCase()
  }

  const normalized = trimmed.toLowerCase()
  if (!isSlug(normalized)) {
    throw createHttpError(422, `Invalid post identifier: ${identifier}`)
  }

  const { rows } = await read(
    `/* getPostIdByAny */
    SELECT ps.post_id AS id
    FROM post_slugs ps
    JOIN posts p ON p.id = ps.post_id
    WHERE ps.slug = $1
      AND p.deleted_at IS NULL
    ORDER BY ps.post_id DESC -- UUIDv7: descending by ID = descending by creation time
    LIMIT 1
  `,
    [normalized],
  )
  return (rows[0]?.id as string | undefined) ?? null
}

async function getUrlIdByAny(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim()

  if (isUUID(trimmed)) {
    return trimmed.toLowerCase()
  }

  // URLs are stored via normalizeUrlForUrlTable().toString() in services/urls/upsert.mts,
  // which upgrades http: → https:, strips fragments, and normalizes scheme/host
  // (e.g. adds trailing slash to bare origins). Applying the same normalization here
  // ensures cache keys and DB queries match.
  // Note: when called via getUrlIdByAnyCached, the input is already normalized by
  // normalizeUrlForCache, so this is idempotent for the cached code path.
  let normalized: string
  try {
    const url = normalizeUrlForUrlTable(trimmed)
    normalized = url.toString()
  } catch (err) {
    throw createHttpError(422, `Invalid URL identifier: ${identifier}`, { cause: err })
  }

  const { rows } = await read(
    `/* getUrlIdByAny */
    SELECT id
    FROM urls
    WHERE url = $1
    LIMIT 1
  `,
    [normalized],
  )
  return (rows[0]?.id as string | undefined) ?? null
}

// Normalize URL via normalizeUrlForUrlTable().toString() before passing to the cache.
// This upgrades http: → https:, strips fragments, and lowercases scheme/host, preserving path case.
// urls_lookup uses a SHA-256 keySerializer (see caches.mts), so cache keys are case-sensitive
// hashes — distinct paths like /Path and /path map to different cache entries.
// On parse failure or unsupported scheme, returns the input unchanged (caller beware).
export function normalizeUrlForCache(identifier: string): string {
  const trimmed = identifier.trim()
  if (isUUID(trimmed)) return trimmed
  try {
    return normalizeUrlForUrlTable(trimmed).toString()
  } catch {
    return trimmed
  }
}

const userIdByAnyCache = caches.users_lookup.cacheGetByAny(getUserIdByAny)
const postIdByAnyCache = caches.posts_lookup.cacheGetByAny(getPostIdByAny)
const topicIdByAnyCache = caches.topics_lookup.cacheGetByAny(getTopicIdByAny)
const topicIdsByAnyBatchCache = caches.topics_lookup.cacheGetByAnyBatch(getTopicIdsByAnyBatch)
const urlIdByAnyCache = caches.urls_lookup.cacheGetByAny(getUrlIdByAny)

// Short-circuit UUID inputs before the cache when UUID identifiers always resolve to themselves,
// so caching uuid→uuid entries in lookup caches is wasteful. Topic UUIDs can redirect after
// topic-alias merges, so topic lookups intentionally go through the cache-backed DB resolver.
// Note: ValkeyCache.cacheGetByAny uses try/finally (not try/catch), so 422 errors thrown by
// the wrapped DB function propagate to callers without being swallowed.
export async function getUserIdByAnyCached(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim().toLowerCase()
  const userId = isUUID(trimmed) ? trimmed : await userIdByAnyCache(trimmed)
  if (!userId) return null
  const { rows } = await write(
    `/* getActiveUserIdForLookupCache */
      SELECT id
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL`,
    [userId],
  )
  return (rows[0]?.id as string | undefined) ?? null
}

export function getPostIdByAnyCached(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim().toLowerCase()
  if (isUUID(trimmed)) return Promise.resolve(trimmed)
  return postIdByAnyCache(trimmed)
}

export function getTopicIdByAnyCached(identifier: string): Promise<string | null> {
  return topicIdByAnyCache(normalizeTopicIdentifierForCache(identifier))
}

export function getTopicIdsByAnyCachedBatch(identifiers: string[]): Promise<Array<string | null>> {
  if (identifiers.length === 0) return Promise.resolve([])
  return topicIdsByAnyBatchCache(identifiers.map(normalizeTopicIdentifierForCache))
}

export function getUrlIdByAnyCached(identifier: string): Promise<string | null> {
  const normalized = normalizeUrlForCache(identifier)
  if (isUUID(normalized)) return Promise.resolve(normalized.toLowerCase())
  return urlIdByAnyCache(normalized)
}

// RSS feeds are only identified by UUID — no slug/alias support yet.
// This function validates UUID format and deduplicates; it has no Valkey cache
// because there are no string identifiers to resolve.
export function resolveRssFeedIds(identifiers: string[]): string[] {
  if (identifiers.length === 0) return []

  return [
    ...new Set(
      identifiers.map(identifier => {
        const trimmed = identifier.trim().toLowerCase()
        if (!isUUID(trimmed)) {
          throw createHttpError(422, `Invalid RSS feed identifier: ${identifier}`)
        }
        return trimmed
      }),
    ),
  ]
}

function normalizeTopicIdentifierForCache(identifier: string): string {
  return identifier.trim().toLowerCase()
}
