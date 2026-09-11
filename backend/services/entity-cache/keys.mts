import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, isUsernameOrSlug } from '@modules/utils'
import { normalizeKey } from '@ts-shared/utils/strings'

// URL/hostname key resolvers live in url-keys.mts (kept out of this file to stay under the
// scc-complexity budget); re-exported here so `@services/entity-cache/keys` consumers resolve
// unchanged.
export { getUrlCacheKeys, getUrlLookupKeys, getUrlHostnameCacheKeys } from './url-keys.mts'

export const getCommunityCacheKeys = async (...keys: unknown[]): Promise<string[]> => {
  const { ids, slugs } = getCacheKeys(keys)
  if (!(ids.size > 0 || slugs.size > 0)) return []
  const filters = []
  const values = []
  if (ids.size > 0) filters.push(`id = ANY($${values.push([...ids])})`)
  if (slugs.size > 0)
    filters.push(`LOWER(slug) = ANY($${values.push([...slugs].map(slug => slug.toLowerCase()))})`)
  const { rows } = await read(
    `/* getCommunityCacheKeys */
    SELECT id, slug
    FROM communities
    WHERE ${filters.join(' OR ')}
  `,
    values,
  )
  for (const row of rows) {
    ids.add(normalizeKey(row.id))
    if (row.slug) slugs.add(normalizeKey(row.slug))
  }
  return [...ids, ...slugs]
}

export const getUserCacheKeys = async (...keys: unknown[]): Promise<string[]> => {
  const { ids, slugs } = getCacheKeys(keys)
  if (!(ids.size > 0 || slugs.size > 0)) return []
  const filters = []
  const values = []
  if (ids.size > 0) filters.push(`id = ANY($${values.push([...ids])})`)
  if (slugs.size > 0) filters.push(`LOWER(username) = ANY($${values.push([...slugs])})`)
  const { rows } = await read(
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
  const filters = []
  const values = []
  if (ids.size > 0) filters.push(`t.id = ANY($${values.push([...ids])})`)
  const normalizedSlugs = [...slugs].map(normalizeKey)
  if (normalizedSlugs.length > 0) {
    const slugPosition = values.push(normalizedSlugs)
    filters.push(`t.slug = ANY($${slugPosition})`)
    filters.push(`ta.alias = ANY($${slugPosition})`)
  }
  const { rows } = await read(
    `/* getTopicCacheKeys */
    -- no-mistakes-disable-next-line postgres-required-predicates: cache invalidation must resolve merged source-topic keys
    WITH matched_topics AS (
      SELECT DISTINCT t.id, t.slug
      FROM topics t
      LEFT JOIN topic_aliases ta ON ta.topic_id = t.id
      WHERE (${filters.join(' OR ')})
    ),
    related_topics AS (
      SELECT id, slug
      FROM matched_topics
      UNION
      SELECT source_topic.id, source_topic.slug
      FROM topics source_topic
      JOIN matched_topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    )
    SELECT related_topics.id, related_topics.slug, ta.alias
    FROM related_topics
    LEFT JOIN topic_aliases ta ON ta.topic_id = related_topics.id
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
  const filters = []
  const values = []
  if (ids.size > 0) filters.push(`post_id = ANY($${values.push([...ids])}::uuid[])`)
  if (slugs.size > 0) filters.push(`slug = ANY($${values.push([...slugs])})`)

  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery(
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

export const getListCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}

export const getStoryCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}

export const getRssFeedItemCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  // RSS feed items can only be looked up by ID, so just normalize the IDs
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}

// getCacheKeys classifies strings as UUIDs or slugs/usernames.
// URL strings (https://...) match neither and are intentionally excluded — use getUrlLookupKeys.
export function getCacheKeys(keys: unknown[]): { ids: Set<string>; slugs: Set<string> } {
  const stringKeys: string[] = (keys.flat(Infinity) as unknown[]).flatMap((x: unknown) => {
    if (!x) return []
    // all possible keys from an object
    if (typeof x === 'object' && x !== null) {
      const obj = x as Record<string, unknown>
      return [obj.id, obj.slug, obj.username].flatMap(v =>
        typeof v === 'string' && v !== '' ? [normalizeKey(v)] : [],
      )
    }
    if (typeof x === 'string') return x !== '' ? [normalizeKey(x)] : []
    throw new Error(`Invalid key: ${x}`)
  })

  const ids = new Set(stringKeys.filter(isUUID))
  // Exclude UUIDs from slugs: isSlug matches /^[a-z0-9-]+$/ which also matches UUID strings.
  const slugs = new Set(stringKeys.filter(k => isUsernameOrSlug(k) && !isUUID(k)))

  return { ids, slugs }
}

export const getRssFeedCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  // RSS feeds can only be looked up by ID, so just normalize the IDs
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}
