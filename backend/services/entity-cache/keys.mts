import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { normalizeKey } from '@ts-shared/utils/strings'
import { getCacheKeys } from './classify-cache-keys.mts'

// URL/hostname key resolvers live in url-keys.mts (kept out of this file to stay under the
// scc-complexity budget); re-exported here so `@services/entity-cache/keys` consumers resolve
// unchanged.
export { getUrlCacheKeys, getUrlLookupKeys, getUrlHostnameCacheKeys } from './url-keys.mts'
export { getCacheKeys } from './classify-cache-keys.mts'

export const getUserCacheKeys = async (...keys: unknown[]): Promise<string[]> => {
  const { ids, slugs } = getCacheKeys(keys)
  if (!(ids.size > 0 || slugs.size > 0)) return []
  const filters = []
  const values = []
  if (ids.size > 0) filters.push(`id = ANY($${values.push([...ids])})`)
  if (slugs.size > 0) filters.push(`LOWER(username) = ANY($${values.push([...slugs])})`)
  const { rows } = await read<{ id: string; username: string | null }>(
    `/* getUserCacheKeys */
    SELECT id, username
    FROM users
    WHERE ${filters.join(' OR ')}
  `,
    values,
  )
  for (const row of rows) {
    ids.add(normalizeKey(row.id))
    if (row.username) slugs.add(normalizeKey(row.username))
  }
  return [...ids, ...slugs]
}
export const getTopicCacheKeys = async (...keys: unknown[]): Promise<string[]> => {
  const { ids, slugs } = getCacheKeys(keys)
  if (!(ids.size > 0 || slugs.size > 0)) return []
  const lookups: string[] = []
  const values: unknown[] = []
  if (ids.size > 0)
    lookups.push(`SELECT id FROM topics WHERE id = ANY($${values.push([...ids])}::uuid[])`)
  const normalizedSlugs = [...slugs].map(normalizeKey)
  if (normalizedSlugs.length > 0) {
    const slugPosition = values.push(normalizedSlugs)
    lookups.push(`SELECT id FROM topics WHERE slug = ANY($${slugPosition}::text[])`)
    lookups.push(
      `SELECT topic_id AS id FROM topic_aliases WHERE alias = ANY($${slugPosition}::text[])`,
    )
  }
  const { rows } = await read<{ id: string; slug: string; alias: string | null }>(
    `/* getTopicCacheKeys */
    WITH matched_topics AS (
      ${lookups.join(' UNION ')}
    ),
    related_topics AS (
      SELECT id FROM matched_topics
      UNION
      SELECT source_topic.id
      FROM topics source_topic
      JOIN matched_topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    )
    SELECT topic.id, topic.slug, ta.alias
    FROM related_topics
    JOIN topics topic ON topic.id = related_topics.id
    LEFT JOIN topic_aliases ta ON ta.topic_id = topic.id
  `,
    values,
  )
  for (const row of rows) {
    ids.add(normalizeKey(row.id))
    slugs.add(normalizeKey(row.slug))
    if (row.alias) slugs.add(normalizeKey(row.alias))
  }

  return [...ids, ...slugs]
}

export const getPostCacheKeysWithOptions = async (
  options: QueryOptions,
  ...keys: unknown[]
): Promise<string[]> => {
  const { ids, slugs } = getCacheKeys(keys)
  if (!(ids.size > 0 || slugs.size > 0)) return []

  // Fetch all slugs for the given IDs and all IDs for the given slugs
  const filters: string[] = []
  const values: unknown[] = []
  if (ids.size > 0) filters.push(`post_id = ANY($${values.push([...ids])}::uuid[])`)
  if (slugs.size > 0) filters.push(`slug = ANY($${values.push([...slugs])})`)

  const query = options.readOnly === false ? write : read
  const { rows } = await query<{ post_id: string; slug: string }>(
    `/* getPostCacheKeys */
    SELECT post_id, slug
    FROM post_slugs
    WHERE ${filters.join(' OR ')}
  `,
    values,
    options,
  )

  for (const row of rows) {
    ids.add(normalizeKey(row.post_id))
    slugs.add(normalizeKey(row.slug))
  }

  return [...ids, ...slugs]
}

export const getPostCacheKeys = (...keys: unknown[]): Promise<string[]> =>
  getPostCacheKeysWithOptions({}, ...keys)

export const getElectionCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}

export const getRssFeedItemCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  // RSS feed items can only be looked up by ID, so just normalize the IDs
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}

export const getRssFeedCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  // RSS feeds can only be looked up by ID, so just normalize the IDs
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}
