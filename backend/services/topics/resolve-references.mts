import { read } from '@data-stores/psql'
import { createSlugFromTitle, isSlug, isUUID } from '@modules/utils'
import type { Topic } from './types.mts'

/**
 * Resolves topic references in one statement. Order is id, exact slug, derived slug, exact
 * case-insensitive name, alias, then merged-source slug. A slug match wins when the same text
 * is also another topic's name. Aliases are not names.
 */
export async function getTopicsByReferenceBatch(
  references: readonly string[],
): Promise<Array<Topic | null>> {
  const ids: string[] = []
  const idOrders: number[] = []
  const slugs: string[] = []
  const slugOrders: number[] = []
  const slugPriorities: number[] = []
  const names: string[] = []
  const nameOrders: number[] = []
  references.forEach((reference, index) => {
    const trimmed = reference.trim()
    if (!trimmed) return
    if (isUUID(trimmed)) {
      ids.push(trimmed)
      idOrders.push(index)
      return
    }
    const folded = trimmed.toLowerCase()
    if (isSlug(folded)) {
      slugs.push(folded)
      slugOrders.push(index)
      slugPriorities.push(1)
    }
    const derivedSlug = createSlugFromTitle(trimmed)
    if (derivedSlug && derivedSlug !== folded) {
      slugs.push(derivedSlug)
      slugOrders.push(index)
      slugPriorities.push(2)
    }
    names.push(folded)
    nameOrders.push(index)
  })
  const results: Array<Topic | null> = references.map(() => null)
  if (ids.length + slugs.length + names.length === 0) return results

  const { rows } = await read<Topic & { input_order: number }>(
    `/* getTopicsByReferenceBatch */
    WITH id_input AS (
      SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS input_order
    ),
    slug_input AS (
      SELECT unnest($3::text[]) AS slug, unnest($4::int[]) AS input_order,
        unnest($5::int[]) AS input_priority
    ),
    name_input AS (
      SELECT unnest($6::text[]) AS name, unnest($7::int[]) AS input_order
    ),
    id_lookups AS (
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS id, id_input.input_order, 0 AS priority
      FROM topics t
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN id_input ON t.id = id_input.id
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (
            destination_topic.deleted_at IS NULL
            AND destination_topic.merged_into_topic_id IS NULL
          )
        )
    ),
    slug_lookups AS (
      SELECT DISTINCT ON (slug_input.input_order)
        COALESCE(t.merged_into_topic_id, t.id) AS id,
        slug_input.input_order,
        CASE WHEN t.merged_into_topic_id IS NULL THEN slug_input.input_priority ELSE 5 END AS priority
      FROM topics t
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN slug_input ON t.slug = slug_input.slug
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (
            destination_topic.deleted_at IS NULL
            AND destination_topic.merged_into_topic_id IS NULL
          )
        )
      ORDER BY slug_input.input_order,
        CASE WHEN t.merged_into_topic_id IS NULL THEN slug_input.input_priority ELSE 5 END,
        t.id
    ),
    name_lookups AS (
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS id, name_input.input_order, 3 AS priority
      FROM topics t
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN name_input ON LOWER(t.name) = name_input.name
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (
            destination_topic.deleted_at IS NULL
            AND destination_topic.merged_into_topic_id IS NULL
          )
        )
    ),
    alias_lookups AS (
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS id, slug_input.input_order, 4 AS priority
      FROM topics t
      JOIN topic_aliases ta ON ta.topic_id = t.id
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN slug_input ON ta.alias = slug_input.slug
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (
            destination_topic.deleted_at IS NULL
            AND destination_topic.merged_into_topic_id IS NULL
          )
        )
    ),
    chosen AS (
      SELECT DISTINCT ON (input_order) id, input_order
      FROM (
        SELECT id, input_order, priority FROM id_lookups
        UNION ALL
        SELECT id, input_order, priority FROM slug_lookups
        UNION ALL
        SELECT id, input_order, priority FROM name_lookups
        UNION ALL
        SELECT id, input_order, priority FROM alias_lookups
      ) hits
      ORDER BY input_order, priority, id
    )
    SELECT vt.*, chosen.input_order
    FROM view_topics vt
    JOIN chosen ON chosen.id = vt.id
    ORDER BY chosen.input_order`,
    [ids, idOrders, slugs, slugOrders, slugPriorities, names, nameOrders],
  )
  for (const row of rows) {
    const { input_order, ...topic } = row
    results[input_order] = topic as Topic
  }
  return results
}
