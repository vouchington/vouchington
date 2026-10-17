import { read, type QueryOptions } from '@data-stores/psql'
import { isSlug, isUUID } from '@modules/utils'
import createError from 'http-errors'
import {
  mapTopicWithRedirect,
  type TopicRedirectRow,
  type TopicWithRedirect,
} from './get-with-redirect-mapping.mts'

/** Ordered single-row lookup semantics, including the original merged source identity. */
export async function getTopicsByAnyWithRedirectBatch(
  identifiers: string[],
  options: QueryOptions = {},
): Promise<Array<TopicWithRedirect | null>> {
  if (identifiers.length === 0) return []
  const inputs = identifiers.map((input, index) => {
    const value = input.trim()
    if (isUUID(value)) return { value, index, byId: true }
    const slug = value.toLowerCase()
    if (isSlug(slug)) return { value: slug, index, byId: false }
    throw createError(422, `Invalid topic identifier: ${input}`)
  })
  const ids = inputs.filter(input => input.byId)
  const slugs = inputs.filter(input => !input.byId)
  const { rows } = await read<TopicRedirectRow & { input_order: number }>(
    `/* getTopicsByAnyWithRedirectBatch */
    WITH id_input AS (
      SELECT value, input_order FROM UNNEST($1::uuid[], $2::int[]) AS input(value, input_order)
    ), slug_input AS (
      SELECT value, input_order FROM UNNEST($3::text[], $4::int[]) AS input(value, input_order)
    ), candidates AS (
      SELECT topic.id, input.input_order, 0 AS priority,
        NULL::uuid AS source_topic_id, NULL::text AS source_topic_slug,
        NULL::text AS source_topic_type
      FROM id_input input JOIN topics topic ON topic.id = input.value
      WHERE topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
      UNION ALL
      SELECT destination.id, input.input_order, 1,
        source.id, source.slug, source.topic_type::text
      FROM id_input input JOIN topics source ON source.id = input.value
      JOIN topics destination ON destination.id = source.merged_into_topic_id
      WHERE source.deleted_at IS NULL AND source.merged_into_topic_id IS NOT NULL
        AND destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL
      UNION ALL
      SELECT topic.id, input.input_order, 0, NULL::uuid, NULL::text, NULL::text
      FROM slug_input input JOIN topics topic ON topic.slug = input.value
      WHERE topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
      UNION ALL
      SELECT destination.id, input.input_order, 1,
        source.id, source.slug, source.topic_type::text
      FROM slug_input input JOIN topics source ON source.slug = input.value
      JOIN topics destination ON destination.id = source.merged_into_topic_id
      WHERE source.deleted_at IS NULL AND source.merged_into_topic_id IS NOT NULL
        AND destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL
      UNION ALL
      SELECT topic.id, input.input_order, 2, NULL::uuid, NULL::text, NULL::text
      FROM slug_input input JOIN topic_aliases alias ON alias.alias = input.value
      JOIN topics topic ON topic.id = alias.topic_id
      WHERE topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
    ), chosen AS (
      SELECT DISTINCT ON (input_order)
        id, input_order, source_topic_id, source_topic_slug, source_topic_type
      FROM candidates ORDER BY input_order, priority, id DESC
    )
    SELECT topic.*, chosen.input_order, chosen.source_topic_id,
      chosen.source_topic_slug, chosen.source_topic_type
    FROM chosen JOIN view_topics topic ON topic.id = chosen.id
    ORDER BY chosen.input_order`,
    [
      ids.map(input => input.value),
      ids.map(input => input.index),
      slugs.map(input => input.value),
      slugs.map(input => input.index),
    ],
    options,
  )
  const results: Array<TopicWithRedirect | null> = Array.from(
    { length: identifiers.length },
    () => null,
  )
  for (const { input_order, ...row } of rows) results[input_order] = mapTopicWithRedirect(row)
  return results
}
