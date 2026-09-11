import { read } from '@data-stores/psql'
import { isSlug, isUUID } from '@modules/utils'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from '@services/batch-lookup'
import createHttpError from 'http-errors'

export async function getTopicIdByAny(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim()

  if (isUUID(trimmed)) {
    const { rows } = await read(
      `/* getTopicIdByAny uuid */
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS topic_id
      FROM topics t
      LEFT JOIN topics destination_topic ON destination_topic.id = t.merged_into_topic_id
      WHERE t.id = $1
        AND t.deleted_at IS NULL
        AND (
          t.merged_into_topic_id IS NULL
          OR (
            destination_topic.deleted_at IS NULL
            AND destination_topic.merged_into_topic_id IS NULL
          )
        )
      LIMIT 1
    `,
      [trimmed.toLowerCase()],
    )
    return (rows[0]?.topic_id as string | undefined) ?? null
  }

  const normalized = trimmed.toLowerCase()
  if (!isSlug(normalized)) {
    throw createHttpError(422, `Invalid topic identifier: ${identifier}`)
  }

  const { rows } = await read(
    `/* getTopicIdByAny */
    SELECT t.id AS topic_id, 0 AS priority
    FROM topics t
    WHERE t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
      AND t.slug = $1
    UNION ALL
    SELECT source_topic.merged_into_topic_id AS topic_id, 1 AS priority
    FROM topics source_topic
    JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    WHERE source_topic.deleted_at IS NULL
      AND source_topic.merged_into_topic_id IS NOT NULL
      AND source_topic.slug = $1
      AND destination_topic.deleted_at IS NULL
      AND destination_topic.merged_into_topic_id IS NULL
    UNION ALL
    SELECT ta.topic_id AS topic_id, 2 AS priority
    FROM topic_aliases ta
    JOIN topics t ON t.id = ta.topic_id
    WHERE t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
      AND ta.alias = $1
    ORDER BY priority, topic_id DESC -- priority 0 (slug) before priority 1 (merged source) before priority 2 (alias); within each priority, UUIDv7 DESC = most recently created
    LIMIT 1
  `,
    [normalized],
  )
  return (rows[0]?.topic_id as string | undefined) ?? null
}

export async function getTopicIdsByAnyBatch(identifiers: string[]): Promise<Array<string | null>> {
  if (identifiers.length === 0) return []

  const normalizedInputs = normalizeBatchIdentifiers(identifiers, input => {
    const trimmed = input.trim()
    const normalized = trimmed.toLowerCase()

    if (isUUID(trimmed)) {
      return { value: trimmed.toLowerCase(), type: 'id' }
    }
    if (isSlug(normalized)) {
      return { value: normalized, type: 'slug' }
    }
    throw createHttpError(422, `Invalid topic identifier: ${input}`)
  })

  const partitions = partitionBatchIdentifiers(normalizedInputs)
  const inputCtes = buildOrderedInputCtes([
    { cteName: 'input_data', sqlType: 'uuid', inputs: partitions.get('id') ?? [] },
    { cteName: 'slug_input_data', sqlType: 'text', inputs: partitions.get('slug') ?? [] },
  ])

  const { rows } = await read(
    `/* getTopicIdsByAnyBatch */
    -- no-mistakes-disable-next-line postgres-required-predicates: dynamic \${inputCtes.ctes} interpolation breaks structural
    -- SQL parsing; id_lookups/slug_candidates below are manually verified to filter both deleted_at
    -- and merged_into_topic_id, following merge chains via destination_topic.
    WITH ${inputCtes.ctes},
    id_lookups AS (
      SELECT COALESCE(t.merged_into_topic_id, t.id) AS topic_id, input_data.input_order
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
    slug_candidates AS (
      SELECT t.id AS topic_id, slug_input_data.input_order, 0 AS priority
      FROM topics t
      JOIN slug_input_data ON t.slug = slug_input_data.input_value
      WHERE t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
      UNION ALL
      SELECT source_topic.merged_into_topic_id AS topic_id, slug_input_data.input_order, 1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      JOIN slug_input_data ON source_topic.slug = slug_input_data.input_value
      WHERE source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL
      UNION ALL
      SELECT ta.topic_id AS topic_id, slug_input_data.input_order, 2 AS priority
      FROM topic_aliases ta
      JOIN topics t ON t.id = ta.topic_id
      JOIN slug_input_data ON ta.alias = slug_input_data.input_value
      WHERE t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
    ),
    slug_lookups AS (
      SELECT DISTINCT ON (input_order) topic_id, input_order
      FROM slug_candidates
      ORDER BY input_order, priority, topic_id DESC -- priority 0 (slug) before priority 1 (merged source) before priority 2 (alias); within each priority, UUIDv7 DESC = most recently created
    ),
    combined_ids AS (
      SELECT topic_id, input_order FROM id_lookups
      UNION ALL
      SELECT topic_id, input_order FROM slug_lookups
    )
    SELECT topic_id, input_order
    FROM combined_ids
    ORDER BY input_order
  `,
    inputCtes.values,
  )

  return scatterOrderedRows(identifiers.length, rows, row => row.topic_id as string)
}
