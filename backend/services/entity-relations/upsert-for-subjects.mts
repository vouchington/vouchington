import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import type {
  EntityIdentifier,
  EntityRelation,
  UpsertEntityRelationsOptions,
  UpsertEntityTypes,
} from './upsert-helpers.mts'
import { writeEntityRelations } from './write-relations.mts'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'

export async function upsertEntityRelationsForSubjects(
  creator: BasicUser,
  relation: EntityRelationMetadata,
  subjects: Array<UpsertEntityTypes | EntityIdentifier>,
  object: UpsertEntityTypes | EntityIdentifier,
  options?: UpsertEntityRelationsOptions,
): Promise<EntityRelation[]> {
  if (subjects.length === 0) return []

  const relations = await writeEntityRelations(
    relation,
    creator,
    subjects.map(subject => ({ subject, object })),
    options,
  )

  if (relation.predicate === 'follow' && relation.object_type === 'rss_feed') {
    /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
    void enqueueBulkEvaluateRssFeedDiscoverability(relations.map(r => r.object_id))
  }

  return relations
}
