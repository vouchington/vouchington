import type { QueryOptions } from '@data-stores/psql/types'
import { isSlug, isUUID } from '@modules/utils'
import { read } from '@data-stores/psql'
import createError from 'http-errors'
import type { Post } from './types.mts'

export const getPostsByAnyBatch = async (
  idsOrSlugs: string[],
  options: QueryOptions = {},
): Promise<Array<Post | null | undefined>> => {
  if (idsOrSlugs.length === 0) {
    return []
  }

  // Normalize and validate inputs
  const normalizedInputs = idsOrSlugs.map((input, index) => {
    const trimmed = input.trim()
    const normalized = trimmed.toLowerCase()

    if (isUUID(trimmed)) {
      return { value: trimmed, isId: true, index }
    } else if (isSlug(normalized)) {
      return { value: normalized, isId: false, index }
    }
    throw createError(422, `Invalid post identifier: ${input}`)
  })

  // Separate UUIDs and slugs
  const idInputs = normalizedInputs.filter(i => i.isId)
  const slugInputs = normalizedInputs.filter(i => !i.isId)

  const { rows } = await read(
    `/* getPostsByAnyBatch */
    WITH id_input AS (
      SELECT unnest($1::uuid[]) AS input_value,
             unnest($2::int[]) AS input_order
    ),
    slug_input AS (
      SELECT unnest($3::text[]) AS input_value,
             unnest($4::int[]) AS input_order
    ),
    id_lookups AS (
      SELECT vp.id, id_input.input_order
      FROM view_posts vp
      JOIN id_input ON vp.id = id_input.input_value
    ),
    slug_lookups AS (
      SELECT DISTINCT ON (slug_input.input_order) ps.post_id AS id, slug_input.input_order
      FROM post_slugs ps
      JOIN slug_input ON ps.slug = slug_input.input_value
      ORDER BY slug_input.input_order, ps.post_id
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM slug_lookups
    )
    SELECT vp.*, ci.input_order
    FROM view_posts vp
    JOIN combined_ids ci ON ci.id = vp.id
    ORDER BY ci.input_order
  `,
    [
      idInputs.map(i => i.value),
      idInputs.map(i => i.index),
      slugInputs.map(i => i.value),
      slugInputs.map(i => i.index),
    ],
    options,
  )

  // Build result array with nulls for missing entries
  const results: Array<Post | null | undefined> = new Array(idsOrSlugs.length).fill(null)

  for (const row of rows) {
    const { input_order, ...postData } = row
    results[input_order] = postData as Post
  }

  return results
}
