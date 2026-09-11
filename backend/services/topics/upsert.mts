import { beginTransaction, write } from '@data-stores/psql'
import { createTopicEmbeddingContent } from './content.mts'
import {
  claimTopicAlias,
  createTopicAliases,
  finalizeClaimedTopicAliases,
  updateTopicAliasesField,
} from './aliases.mts'
import { getTopicByAny } from './get.mts'
import { validateSlug } from '@modules/utils'
import type { Topic, TopicTypes } from './types.mts'
import type { TopicAlias } from './alias-types.mts'
import createError from 'http-errors'

type UpsertTopicOptions = {
  aliases?: string[]
  topic_type?: TopicTypes
}

export async function upsertTopic(
  name: string,
  slug: string,
  options?: UpsertTopicOptions,
): Promise<Topic> {
  validateSlug(slug)

  let result: Awaited<ReturnType<typeof upsertTopicOnce>>
  try {
    result = await upsertTopicOnce(name, slug, options)
  } catch (error) {
    if (isUniqueViolation(error)) {
      result = await upsertTopicOnce(name, slug, options)
    } else {
      throw error
    }
  }
  await finalizeClaimedTopicAliases(result.topic.id, result.claimedAliases)
  return result.topic
}

async function upsertTopicOnce(
  name: string,
  slug: string,
  options?: UpsertTopicOptions,
): Promise<{ topic: Topic; claimedAliases: TopicAlias[] }> {
  const { content_sha256 } = createTopicEmbeddingContent({ name })
  const topicType = options?.topic_type ?? 'topic'

  await using query = await beginTransaction()
  const queryOptions = { query }
  // no-mistakes-disable-next-line postgres-required-predicates: revive matches soft-deleted rows; merge resolution inspects merged sources
  const { rows } = await write(
    `/* upsertTopicOnce */ WITH existing_topic AS (SELECT id FROM topics WHERE (slug = $2 OR LOWER(name) = LOWER($1)) AND merged_into_topic_id IS NULL ORDER BY CASE WHEN slug = $2 THEN 0 ELSE 1 END LIMIT 1), merged_destination AS (SELECT destination_topic.id FROM topics source_topic JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id WHERE (source_topic.slug = $2 OR LOWER(source_topic.name) = LOWER($1)) AND source_topic.merged_into_topic_id IS NOT NULL AND destination_topic.deleted_at IS NULL AND destination_topic.merged_into_topic_id IS NULL ORDER BY CASE WHEN source_topic.slug = $2 THEN 0 ELSE 1 END LIMIT 1), slug_resolution AS (SELECT CASE WHEN direct.merged_into_topic_id IS NULL THEN direct.id ELSE destination.id END AS id FROM (SELECT id, merged_into_topic_id FROM topics WHERE slug = $2 LIMIT 1) direct LEFT JOIN topics destination ON destination.id = direct.merged_into_topic_id AND destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL), name_resolution AS (SELECT CASE WHEN direct.merged_into_topic_id IS NULL THEN direct.id ELSE destination.id END AS id FROM (SELECT id, merged_into_topic_id FROM topics WHERE LOWER(name) = LOWER($1) LIMIT 1) direct LEFT JOIN topics destination ON destination.id = direct.merged_into_topic_id AND destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL), mismatch AS (SELECT 1 FROM slug_resolution s, name_resolution n WHERE s.id IS NOT NULL AND n.id IS NOT NULL AND s.id <> n.id), updated_topic AS (UPDATE topics SET deleted_at = NULL, name = $1, slug = $2, topic_type = $4, bedrock_nova_multimodal_v1_content_sha256 = $3 WHERE id = (SELECT id FROM existing_topic) AND NOT EXISTS (SELECT 1 FROM merged_destination) AND NOT EXISTS (SELECT 1 FROM mismatch) RETURNING id), inserted_topic AS (INSERT INTO topics (name, slug, topic_type, bedrock_nova_multimodal_v1_content_sha256) SELECT $1, $2, $4, $3 WHERE NOT EXISTS (SELECT 1 FROM existing_topic) AND NOT EXISTS (SELECT 1 FROM merged_destination) AND NOT EXISTS (SELECT 1 FROM mismatch) RETURNING id) SELECT id, false AS conflict FROM updated_topic UNION ALL SELECT id, false AS conflict FROM inserted_topic UNION ALL SELECT id, false AS conflict FROM merged_destination WHERE NOT EXISTS (SELECT 1 FROM mismatch) UNION ALL SELECT NULL, true AS conflict FROM mismatch`,
    [name, slug, content_sha256, topicType],
    queryOptions,
  )

  const row = rows[0]
  if (row?.conflict) {
    throw createError(
      409,
      `Conflicting topic match: slug and name resolve to different topics (name: ${name}, slug: ${slug})`,
    )
  }

  const topicId = row?.id
  if (!topicId) {
    throw new Error(`Failed to upsert topic (name: ${name}, slug: ${slug})`)
  }

  const resolvedTopic = await getTopicByAny(topicId, queryOptions)
  if (!resolvedTopic) {
    throw new Error(`Failed to retrieve topic after upsert (id: ${topicId})`)
  }

  const canonicalAlias = await claimTopicAlias(topicId, resolvedTopic.slug, queryOptions)
  const claimedAliases = new Map([[canonicalAlias.id, canonicalAlias]])
  const aliases = options?.aliases
  if (aliases && aliases.length > 0) {
    const optionalAliases = await createTopicAliases(topicId, aliases, {
      ...queryOptions,
      skipSideEffects: true,
    })
    for (const alias of optionalAliases) claimedAliases.set(alias.id, alias)
  } else {
    await updateTopicAliasesField(topicId, { ...queryOptions, skipSideEffects: true })
  }

  const topic = await getTopicByAny(topicId, queryOptions)
  if (!topic) {
    throw new Error(`Failed to retrieve topic after upsert (id: ${topicId})`)
  }
  const result = { topic, claimedAliases: [...claimedAliases.values()] }
  await query.commit()
  return result
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
