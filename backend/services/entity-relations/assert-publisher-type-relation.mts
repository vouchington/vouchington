import assert from 'http-assert'
import type { EntityRelationMetadata } from './metadata.mts'
import { getEntityId, type UpsertEntityTypes, type EntityIdentifier } from './upsert-helpers.mts'
import { read } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { PUBLISHER_TYPE_SLUGS } from '@ts-shared/utils/publisher-types'

export async function assertPublisherTypeObjectsAreValid(
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
): Promise<void> {
  if (
    relation.subject_type !== 'topic' ||
    relation.predicate !== 'publisher_type' ||
    relation.object_type !== 'topic'
  ) {
    return
  }

  const subjectId = getEntityId(subject)
  const { rows } = await read(sql`/* assertPublisherTypeObjectsAreValid:subject */
    SELECT topic_type
    FROM topics
    WHERE id = ${subjectId}
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
    LIMIT 1
  `)
  assert(rows[0]?.topic_type === 'rss_feed', 422, 'Publisher type tags require a Source topic')

  // Local reimplementation of @services/topics' getPublisherTypeTopicIds — a simple,
  // side-effect-free lookup (uncached, unlike the topics-side helper, since this guard is a rare
  // validation path). Reimplemented here so entity-relations never depends on @services/topics,
  // which already depends on entity-relations for relation writes.
  const { rows: allowedRows } = await read(sql`/* assertPublisherTypeObjectsAreValid:allowed */
    SELECT id
    FROM topics
    WHERE slug = ANY(${PUBLISHER_TYPE_SLUGS})
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
  `)
  const allowedIds = new Set(allowedRows.map(row => row.id as string))
  for (const object of objects) {
    const id = getEntityId(object)
    assert(allowedIds.has(id), 422, 'Invalid publisher type: object must be a known publisher type')
  }
}

/** Rechecks publisher-type relation validity under topic key-share locks in the mutation transaction. */
export async function assertPublisherTypeObjectsAreValidInTransaction(
  query: TransactionQuery,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
): Promise<void> {
  if (
    relation.subject_type !== 'topic' ||
    relation.predicate !== 'publisher_type' ||
    relation.object_type !== 'topic'
  ) {
    return
  }

  const subjectId = getEntityId(subject)
  const objectIds = objects.map(getEntityId)
  const topicIds = [...new Set([subjectId, ...objectIds])].toSorted()
  const { rows } = await query<{
    id: string
    topic_type: string
    slug: string
    deleted_at: Date | null
    merged_into_topic_id: string | null
  }>(sql`/* assertPublisherTypeObjectsAreValidInTransaction:topics */
    -- no-mistakes-disable-next-line postgres-required-predicates: transaction validation locks inactive rows so lifecycle changes are rejected
    SELECT id, topic_type, slug, deleted_at, merged_into_topic_id
    FROM topics
    WHERE id = ANY(${topicIds}::uuid[])
    ORDER BY id
    FOR KEY SHARE
  `)
  const topicsById = new Map(rows.map(row => [row.id, row]))
  const subjectTopic = topicsById.get(subjectId)
  assert(
    subjectTopic?.topic_type === 'rss_feed' &&
      subjectTopic.deleted_at === null &&
      subjectTopic.merged_into_topic_id === null,
    422,
    'Publisher type tags require a Source topic',
  )

  for (const objectId of objectIds)
    assert(
      isAllowedPublisherTypeTopic(topicsById.get(objectId)),
      422,
      'Invalid publisher type: object must be a known publisher type',
    )
}

function isAllowedPublisherTypeTopic(
  topic:
    | {
        topic_type: string
        slug: string
        deleted_at: Date | null
        merged_into_topic_id: string | null
      }
    | undefined,
): boolean {
  return Boolean(
    topic &&
    PUBLISHER_TYPE_SLUGS.includes(topic.slug as (typeof PUBLISHER_TYPE_SLUGS)[number]) &&
    topic.deleted_at === null &&
    topic.merged_into_topic_id === null,
  )
}
