import { read, type QueryOptions } from '@data-stores/psql'
import { isSlug, isUUID } from '@modules/utils'
import createError from 'http-errors'
import type { Post } from './types.mts'

/** Hydrate requested posts and their roots together, including roots discovered in cache hits. */
export async function getPostsWithRootsByAnyBatch(
  identifiers: string[],
  additionalRootIds: string[] = [],
  options: QueryOptions = {},
): Promise<Map<string, Post | null>> {
  for (const identifier of identifiers) {
    if (!isUUID(identifier) && !isSlug(identifier))
      throw createError(422, 'Invalid post id or slug')
  }
  const inputs = [...new Set(identifiers.map(id => id.toLowerCase()))]
  const ids = inputs.filter(isUUID)
  const slugs = inputs.filter(id => !isUUID(id))
  const rootIds = [...new Set(additionalRootIds.map(id => id.trim().toLowerCase()))]
  for (const id of rootIds) {
    if (!isUUID(id)) throw createError(422, `Invalid post identifier: ${id}`)
  }
  if (inputs.length === 0 && rootIds.length === 0) return new Map()
  const { rows } = await read<Post & { input_keys: string[] | null }>(
    `/* getPostsWithRootsByAnyBatch */
    WITH requested_keys AS (
      SELECT id, id::text AS input_key FROM UNNEST($1::uuid[]) AS input(id)
      UNION ALL
      SELECT post_id AS id, slug AS input_key FROM post_slugs WHERE slug = ANY($3::text[])
    ), requested AS (
      SELECT posts.id, posts.root_post_id FROM posts
      JOIN requested_keys ON requested_keys.id = posts.id WHERE posts.deleted_at IS NULL
    ), all_ids AS (
      SELECT id FROM requested
      UNION SELECT root_post_id FROM requested WHERE root_post_id IS NOT NULL
      UNION SELECT UNNEST($2::uuid[])
    ), aliases AS (
      SELECT id, ARRAY_AGG(input_key) AS input_keys FROM requested_keys GROUP BY id
    )
    SELECT view_posts.*, aliases.input_keys FROM view_posts
    JOIN all_ids ON all_ids.id = view_posts.id LEFT JOIN aliases ON aliases.id = view_posts.id`,
    [ids, rootIds, slugs],
    options,
  )
  const results = new Map<string, Post | null>([...inputs, ...rootIds].map(id => [id, null]))
  for (const { input_keys, ...row } of rows) {
    results.set(row.id, row)
    for (const key of input_keys ?? []) results.set(key, row)
    if (row.root_post_id && !results.has(row.root_post_id)) results.set(row.root_post_id, null)
  }
  return results
}
