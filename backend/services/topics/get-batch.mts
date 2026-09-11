import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, isSlug } from '@modules/utils'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from '@services/batch-lookup'
import type { Topic } from './types.mts'
import createError from 'http-errors'

export const getTopicsByAnyBatch = async (
  idsOrSlugs: string[],
  options: QueryOptions = {},
): Promise<Array<Topic | null | undefined>> => {
  if (idsOrSlugs.length === 0) {
    return []
  }

  const normalizedInputs = normalizeBatchIdentifiers(idsOrSlugs, input => {
    const trimmed = input.trim()
    const normalized = trimmed.toLowerCase()

    if (isUUID(trimmed)) {
      return { value: trimmed, type: 'id' }
    }
    if (isSlug(normalized)) {
      return { value: normalized, type: 'slug' }
    }
    throw createError(422, `Invalid topic identifier: ${input}`)
  })

  const partitions = partitionBatchIdentifiers(normalizedInputs)
  const inputCtes = buildOrderedInputCtes([
    { cteName: 'input_data', sqlType: 'uuid', inputs: partitions.get('id') ?? [] },
    { cteName: 'slug_input_data', sqlType: 'text', inputs: partitions.get('slug') ?? [] },
  ])

  const { rows } = await read(
    `/* getTopicsByAnyBatch */
    -- no-mistakes-disable-next-line postgres-required-predicates: dynamic \${inputCtes.ctes} interpolation breaks structural
    -- SQL parsing; id_lookups/slug_lookups below are manually verified to filter both deleted_at
    -- and merged_into_topic_id, following merge chains via destination_topic.
    WITH ${inputCtes.ctes},
    id_lookups AS (
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS id, input_data.input_order
      FROM topics t
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN input_data ON t.id = input_data.input_value
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
      SELECT DISTINCT ON (slug_input_data.input_order)
        COALESCE(t.merged_into_topic_id, t.id) AS id,
        slug_input_data.input_order
      FROM topics t
      LEFT JOIN topic_aliases ta ON ta.topic_id = t.id
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      JOIN slug_input_data ON (t.slug = slug_input_data.input_value OR ta.alias = slug_input_data.input_value)
      WHERE t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (
            destination_topic.deleted_at IS NULL
            AND destination_topic.merged_into_topic_id IS NULL
          )
        )
      ORDER BY
        slug_input_data.input_order,
        CASE
          WHEN t.slug = slug_input_data.input_value AND t.merged_into_topic_id IS NULL THEN 0
          WHEN t.slug = slug_input_data.input_value THEN 1
          ELSE 2
        END,
        t.id
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM slug_lookups
    )
    SELECT vt.*, ci.input_order
    FROM view_topics vt
    JOIN combined_ids ci ON ci.id = vt.id
    ORDER BY ci.input_order
  `,
    inputCtes.values,
    options,
  )

  return scatterOrderedRows(idsOrSlugs.length, rows, row => {
    const { input_order: _input_order, ...topicData } = row
    return topicData as Topic
  })
}

export const getTopicsBySlugBatch = async (
  slugs: string[],
  options: QueryOptions = {},
): Promise<Array<Topic | null | undefined>> => {
  if (slugs.length === 0) {
    return []
  }

  const normalizedSlugs = slugs.map(slug => slug.toLowerCase().trim())
  const inputOrder = slugs.map((_, index) => index)

  const { rows } = await read(
    `/* getTopicsBySlugBatch */
    WITH input_data AS (
      SELECT unnest($1::text[]) AS input_value,
             unnest($2::int[]) AS input_order
    ),
    candidates AS (
      SELECT t.id, input_data.input_order, 0 AS priority
      FROM topics t
      JOIN input_data ON t.slug = input_data.input_value
      WHERE t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL

      UNION ALL

      SELECT source_topic.merged_into_topic_id AS id, input_data.input_order, 1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      JOIN input_data ON source_topic.slug = input_data.input_value
      WHERE source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL
    ),
    topic_data AS (
      SELECT DISTINCT ON (input_order) id, input_order
      FROM candidates
      ORDER BY input_order, priority, id DESC
    )
    SELECT vt.*, topic_data.input_order
    FROM view_topics vt
    JOIN topic_data ON topic_data.id = vt.id
    ORDER BY topic_data.input_order
  `,
    [normalizedSlugs, inputOrder],
    options,
  )

  return scatterOrderedRows(slugs.length, rows, row => {
    const { input_order: _input_order, ...topicData } = row
    return topicData as Topic
  })
}
