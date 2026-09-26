import { enqueueOnTopicCreated } from '@queues/entity-listeners/enqueues'
import { topicTypes } from '@voucha/types/entities/topic'
import type { CreateTopicUpdates, Topic } from './types.mts'
import { createTopicEmbeddingContent } from './content.mts'
import { resolveHostname, setTopicHostnameLink } from './hostname-link.mts'
import type { PrivateUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, validateSlug } from '@modules/utils'
import { normalizeKey } from '@ts-shared/utils/strings'
import { beginTransaction, write } from '@data-stores/psql'
import { getTopicByAny } from './get.mts'
import { currentUserCanCreateTopic } from './authorization.mts'
import { getUrlById } from '@services/urls'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { createTopicRevision, computeTopicChanges } from '@services/topic-revisions'
import { claimTopicAlias, linkTopicAlias, updateTopicAliasesField } from './aliases.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'

export function finalizeCreatedTopic(topic: Topic, updates: CreateTopicUpdates): void {
  entityCacheBloomFilters.topics.add([topic.id, topic.slug, ...topic.aliases].map(normalizeKey))
  void enqueueOnTopicCreated(topic.id, updates)
  if (updates.source_topic_alias_id)
    void invalidatePostsForTopicAliases([updates.source_topic_alias_id])
}

// on create, we create the minimum topic and expect all updates to happen after
export const createTopic = async (
  provenance: ContentProvenance,
  creator: PrivateUser,
  updates: CreateTopicUpdates,
  options: QueryOptions = {},
) => {
  assert(currentUserCanCreateTopic(creator), 403, 'Forbidden')
  const topicType = updates.topic_type || 'topic'
  assert(topicTypes[topicType], 422, `Invalid topic type: ${updates.topic_type}`)

  assert(updates.name, 422, 'Name is required')
  assert(updates.slug, 422, 'Slug is required')
  validateSlug(updates.slug)

  if (updates.homepage_url_id !== undefined && updates.homepage_url_id !== null) {
    assert(isUUID(updates.homepage_url_id), 422, 'Invalid homepage_url_id')
  }

  updates.updated_by_id = creator.id

  const queryOptions = options.query ? { query: options.query } : options.client ? options : null

  if (queryOptions) {
    return createTopicInDatabase(provenance, creator, updates, queryOptions)
  }

  await using query = await beginTransaction()
  const createdTopic = await createTopicInDatabase(provenance, creator, updates, { query })
  await query.commit()
  finalizeCreatedTopic(createdTopic, updates)
  return createdTopic
}

async function createTopicInDatabase(
  provenance: ContentProvenance,
  creator: PrivateUser,
  updates: CreateTopicUpdates,
  options: QueryOptions,
): Promise<Topic> {
  const topicType = updates.topic_type || 'topic'

  // Set current embedding content hash upon creation.
  const { content_sha256 } = createTopicEmbeddingContent({ name: updates.name })

  if (updates.homepage_url_id !== undefined && updates.homepage_url_id !== null) {
    const url = await getUrlById(updates.homepage_url_id, options)
    assert(url, 422, 'homepage_url_id does not reference a known URL')
  }

  const { rows } = await write(
    sql`/* createTopicInDatabase */
    WITH source_alias_owner AS (
      -- no-mistakes-disable-next-line postgres-required-predicates: source-alias owner must be soft-deleted to revive it
      SELECT topic.id
      FROM topic_aliases source_alias
      JOIN topics topic ON topic.id = source_alias.topic_id
      WHERE source_alias.id = ${updates.source_topic_alias_id ?? null}
        AND topic.slug = ${updates.slug}
        AND topic.deleted_at IS NOT NULL
        AND topic.merged_into_topic_id IS NULL
      FOR UPDATE OF topic
    ),
    -- A revived topic keeps the provenance of the request that first created it.
    revived_topic AS (
      UPDATE topics
      SET
        deleted_at = NULL,
        deleted_by_id = NULL,
        name = ${updates.name},
        topic_type = ${topicType},
        updated_by_id = ${creator.id},
        bedrock_nova_multimodal_v1_content_sha256 = ${content_sha256},
        homepage_url_id = ${updates.homepage_url_id ?? null}
      WHERE id = (SELECT id FROM source_alias_owner)
      RETURNING id
    ),
    inserted_topic AS (
      INSERT INTO topics (
        name,
        slug,
        topic_type,
        created_by_id,
        bedrock_nova_multimodal_v1_content_sha256,
        homepage_url_id,
        created_via,
        created_via_oauth_client_id
      )
      SELECT
        ${updates.name},
        ${updates.slug},
        ${topicType},
        ${creator.id},
        ${content_sha256},
        ${updates.homepage_url_id ?? null},
        ${provenance.createdVia},
        ${provenance.oauthClientId}
      WHERE NOT EXISTS (SELECT 1 FROM source_alias_owner)
      RETURNING id
    )
    SELECT id FROM revived_topic
    UNION ALL
    SELECT id FROM inserted_topic
  `,
    options,
  )

  const topicId = rows[0].id as string
  if (updates.source_topic_alias_id) {
    await linkTopicAlias(topicId, updates.source_topic_alias_id, {
      ...options,
      skipSideEffects: true,
    })
  }
  await claimTopicAlias(topicId, updates.slug, options)
  await updateTopicAliasesField(topicId, { ...options, skipSideEffects: true })
  if (updates.hostname !== undefined) {
    const hostnameId = await resolveHostname(creator.id, updates.hostname, options)
    await setTopicHostnameLink(topicId, hostnameId, options)
  }

  const topic = (await getTopicByAny(topicId, options))!
  const changes = computeTopicChanges(null, topic)
  await createTopicRevision(topicId, 'create', changes, creator.id, options)
  return topic
}
