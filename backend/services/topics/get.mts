import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, isSlug } from '@modules/utils'
import type { Topic } from './types.mts'
import createError from 'http-errors'

import {
  mapTopicWithRedirect,
  type TopicWithRedirect,
  type TopicRedirectRow,
} from './get-with-redirect-mapping.mts'
export type { TopicWithRedirect } from './get-with-redirect-mapping.mts'

export async function getTopicBySlug(slug: string): Promise<Topic | null> {
  const { rows } = await read<Topic>(
    `/* getTopicBySlug */
    WITH candidates AS (
      SELECT t.id, 0 AS priority
      FROM topics t
      WHERE t.slug = $1
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL

      UNION ALL

      SELECT source_topic.merged_into_topic_id AS id, 1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      WHERE source_topic.slug = $1
        AND source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL
    ),
    topic_data AS (
      SELECT id
      FROM candidates
      ORDER BY priority, id DESC
      LIMIT 1
    )
    SELECT view_topics.*
    FROM view_topics
    JOIN topic_data ON topic_data.id = view_topics.id
    LIMIT 1
  `,
    [slug.toLowerCase().trim()],
  )
  return rows[0] ?? null
}

export const getTopicByAnyWithRedirect = async (
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<TopicWithRedirect | null> => {
  const trimmedInput = idOrSlug.trim()
  const normalizedInput = trimmedInput.toLowerCase()

  const values = [trimmedInput]
  let candidatesSql: string
  if (isUUID(trimmedInput)) {
    candidatesSql = `
      SELECT
        t.id,
        NULL::uuid AS source_topic_id,
        NULL::text AS source_topic_slug,
        NULL::text AS source_topic_type,
        0 AS priority
      FROM topics t
      WHERE t.id = $1
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL

      UNION ALL

      SELECT
        source_topic.merged_into_topic_id AS id,
        source_topic.id AS source_topic_id,
        source_topic.slug AS source_topic_slug,
        source_topic.topic_type::text AS source_topic_type,
        1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      WHERE source_topic.id = $1
        AND source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL
    `
  } else if (isSlug(normalizedInput)) {
    values[0] = normalizedInput
    candidatesSql = `
      SELECT
        t.id,
        NULL::uuid AS source_topic_id,
        NULL::text AS source_topic_slug,
        NULL::text AS source_topic_type,
        0 AS priority
      FROM topics t
      WHERE t.slug = $1
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL

      UNION ALL

      SELECT
        source_topic.merged_into_topic_id AS id,
        source_topic.id AS source_topic_id,
        source_topic.slug AS source_topic_slug,
        source_topic.topic_type::text AS source_topic_type,
        1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      WHERE source_topic.slug = $1
        AND source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL

      UNION ALL

      SELECT
        ta.topic_id AS id,
        NULL::uuid AS source_topic_id,
        NULL::text AS source_topic_slug,
        NULL::text AS source_topic_type,
        2 AS priority
      FROM topic_aliases ta
      JOIN topics t ON t.id = ta.topic_id
      WHERE ta.alias = $1
        AND t.deleted_at IS NULL
    `
  } else {
    throw createError(422, `Invalid topic identifier: ${idOrSlug}`)
  }

  const { rows } = await read(
    `/* getTopicByAny */
    WITH candidates AS (
      ${candidatesSql}
    ),
    topic_data AS (
      SELECT *
      FROM candidates
      ORDER BY priority, id DESC
      LIMIT 1
    )

    SELECT
      view_topics.*,
      topic_data.source_topic_id,
      topic_data.source_topic_slug,
      topic_data.source_topic_type
    FROM view_topics
    JOIN topic_data ON topic_data.id = view_topics.id
    LIMIT 1
  `,
    values,
    options,
  )
  const row = rows[0]
  if (!row) return null

  return mapTopicWithRedirect(row as TopicRedirectRow)
}

export const getTopicByAny = async (
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<Topic | null> => {
  const result = await getTopicByAnyWithRedirect(idOrSlug, options)
  return result?.topic ?? null
}
