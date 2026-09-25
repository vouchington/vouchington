import {
  entityRelations,
  entityRelationPredicates,
  type EntityRelationEntityType,
  type EntityRelationPredicateType,
} from './entity-relations-config.mts'

export type EntityRelationMetadata = {
  subject_type: EntityRelationEntityType
  object_type: EntityRelationEntityType
  predicate: EntityRelationPredicateType
  description: string
  order_index: boolean
  election: boolean
  is_bookmark: boolean
  bidirectional: boolean
  table_name: string
  extra_indexes: string[]
}

export const entityRelationMetadatum: EntityRelationMetadata[] = []

for (const subjectType of Object.keys(entityRelations)) {
  const subjectRelations = entityRelations[subjectType as EntityRelationEntityType]
  if (!subjectRelations) continue
  for (const objectType of Object.keys(subjectRelations)) {
    const objectRelations = subjectRelations[objectType as EntityRelationEntityType]
    if (!objectRelations) continue
    for (const predicate of Object.keys(objectRelations)) {
      const options = objectRelations[predicate as EntityRelationPredicateType]
      entityRelationMetadatum.push({
        subject_type: subjectType as EntityRelationEntityType,
        object_type: objectType as EntityRelationEntityType,
        predicate: predicate as EntityRelationPredicateType,
        description: entityRelationPredicates[predicate].description ?? '',
        order_index: entityRelationPredicates[predicate].order_index ?? false,
        election: entityRelationPredicates[predicate].election ?? false,
        is_bookmark: entityRelationPredicates[predicate].is_bookmark ?? false,
        bidirectional: entityRelationPredicates[predicate].bidirectional ?? false,
        table_name: ['relation', subjectType, predicate, objectType].join('__'),
        extra_indexes: options?.extra_indexes ?? [],
      })
    }
  }
}

type EntityRelationLookup = {
  subjectType: EntityRelationEntityType
  objectType: EntityRelationEntityType
  predicate: EntityRelationPredicateType
}

function getEntityRelationMetadata(
  lookup: EntityRelationLookup,
): EntityRelationMetadata | undefined {
  return entityRelationMetadatum.find(
    relation =>
      relation.subject_type === lookup.subjectType &&
      relation.object_type === lookup.objectType &&
      relation.predicate === lookup.predicate,
  )
}

export function getEntityRelationMetadataOrThrow(
  lookup: EntityRelationLookup,
): EntityRelationMetadata {
  const relation = getEntityRelationMetadata(lookup)
  if (relation) return relation

  throw new Error(
    `Missing entity relation metadata for ${lookup.subjectType} -> ${lookup.predicate} -> ${lookup.objectType}`,
  )
}

export function getEntityRelationTableNameOrThrow(lookup: EntityRelationLookup): string {
  return getEntityRelationMetadataOrThrow(lookup).table_name
}

export function getEntityRelationVoteTableName(metadata: EntityRelationMetadata): string {
  return `${metadata.table_name}__votes`
}

export function getEntityRelationIntegrityTargetColumn(metadata: EntityRelationMetadata): string {
  return `${metadata.table_name}_id`
}

export function getEntityRelationIntegritySubjectColumn(metadata: EntityRelationMetadata): string {
  return `${metadata.table_name}_subject_id`
}

type EntityRelationEntityTables = {
  // which table relationships to this entity should have a foreign key reference to
  foreign_key_table: string
  // override the JOIN source used when building object_data — use a view for redacted projections.
  // when absent, foreign_key_table is also used for the JOIN.
  select_table?: string
  // e.g. a card is actually a topic
  parent_entity_type?: EntityRelationEntityType
  // whether the table has a deleted_at column for soft deletes
  has_soft_delete: boolean
}

export const entityRelationEntityTables: Record<
  EntityRelationEntityType,
  EntityRelationEntityTables
> = {
  user: {
    foreign_key_table: 'users',
    // Relation reads join the public view so only active users with public columns can match.
    // view_users_public already filters deleted_at IS NULL, so has_soft_delete is false.
    select_table: 'view_users_public',
    has_soft_delete: false,
  },
  post: {
    foreign_key_table: 'posts',
    has_soft_delete: true,
  },
  topic: {
    foreign_key_table: 'topics',
    has_soft_delete: true,
  },
  topic_alias: {
    foreign_key_table: 'topic_aliases',
    has_soft_delete: false,
  },
  rss_feed: {
    foreign_key_table: 'rss_feeds',
    has_soft_delete: true,
  },
  rss_feed_item: {
    foreign_key_table: 'rss_feed_items',
    has_soft_delete: true,
  },
  url: {
    foreign_key_table: 'urls',
    has_soft_delete: false,
  },
  url_hostname: {
    foreign_key_table: 'url_hostnames',
    has_soft_delete: false,
  },
  // image is reserved for future use; currently not used as object type in any relations
  image: {
    foreign_key_table: 'images',
    has_soft_delete: true,
  },

  // for subtypes, we JOIN against a smaller table for referential integrity.
  card: {
    foreign_key_table: 'topics__cards',
    parent_entity_type: 'topic',
    has_soft_delete: false,
  },
  rewards_program: {
    foreign_key_table: 'topics__rewards_programs',
    parent_entity_type: 'topic',
    has_soft_delete: false,
  },
  rewards_program_status: {
    foreign_key_table: 'topics__rewards_program_statuses',
    parent_entity_type: 'topic',
    has_soft_delete: false,
  },
  referral_program: {
    foreign_key_table: 'topics__referral_programs',
    parent_entity_type: 'topic',
    has_soft_delete: false,
  },
  review: {
    foreign_key_table: 'post_review_topic_ratings',
    parent_entity_type: 'post',
    has_soft_delete: false,
  },
  discussion: {
    foreign_key_table: 'posts__discussions',
    parent_entity_type: 'post',
    has_soft_delete: false,
  },
  community: {
    foreign_key_table: 'communities',
    has_soft_delete: true,
  },
  remote_actor: {
    foreign_key_table: 'remote_actors',
    has_soft_delete: true,
  },
}
