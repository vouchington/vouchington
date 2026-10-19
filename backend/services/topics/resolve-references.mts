import { read } from '@data-stores/psql'
import { isSlug, isUUID } from '@modules/utils'
import type { Topic } from './types.mts'

/**
 * Resolves topic references in one statement. Order is id, then slug (including a merged
 * source slug and `topic_aliases.alias`), then case-insensitive exact name. A slug match
 * wins when the same text is also another topic's name. Aliases are not names.
 */
export async function getTopicsByReferenceBatch(
  references: readonly string[],
): Promise<Array<Topic | null>> {
  const ids: string[] = []
  const idOrders: number[] = []
  const slugs: string[] = []
  const slugOrders: number[] = []
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
      SELECT unnest($3::text[]) AS slug, unnest($4::int[]) AS input_order
    ),
    name_input AS (
      SELECT unnest($5::text[]) AS name, unnest($6::int[]) AS input_order
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
        1 AS priority
      FROM topics t
      LEFT JOIN topic_aliases ta ON ta.topic_id = t.id
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN slug_input ON (t.slug = slug_input.slug OR ta.alias = slug_input.slug)
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (
            destination_topic.deleted_at IS NULL
            AND destination_topic.merged_into_topic_id IS NULL
          )
        )
      ORDER BY slug_input.input_order,
        CASE
          WHEN t.slug = slug_input.slug AND t.merged_into_topic_id IS NULL THEN 0
          WHEN t.slug = slug_input.slug THEN 1
          ELSE 2
        END,
        t.id
    ),
    name_lookups AS (
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS id, name_input.input_order, 2 AS priority
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
    chosen AS (
      SELECT DISTINCT ON (input_order) id, input_order
      FROM (
        SELECT id, input_order, priority FROM id_lookups
        UNION ALL
        SELECT id, input_order, priority FROM slug_lookups
        UNION ALL
        SELECT id, input_order, priority FROM name_lookups
      ) hits
      ORDER BY input_order, priority, id
    )
    SELECT vt.*, chosen.input_order
    FROM view_topics vt
    JOIN chosen ON chosen.id = vt.id
    ORDER BY chosen.input_order`,
    [ids, idOrders, slugs, slugOrders, names, nameOrders],
  )
  for (const row of rows) {
    const { input_order, ...topic } = row
    results[input_order] = topic as Topic
  }
  return results
}
