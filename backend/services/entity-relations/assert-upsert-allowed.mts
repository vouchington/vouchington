import { assertRelationLimit } from './relation-limits.mts'
import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'
import { assertPostRelatedUrlsAllowed } from './assert-post-related-urls-allowed.mts'
import {
  assertPublisherTypeObjectsAreValid,
  assertPublisherTypeObjectsAreValidInTransaction,
} from './assert-publisher-type-relation.mts'
import { assertTopicParentRelationsAreValid } from './assert-topic-parent-relation.mts'
import { assertUrlObjectsAreValid } from './assert-url-objects-are-valid.mts'
import { assertUserTagObjectsAreValid } from './assert-user-tag-relation.mts'

export async function assertEntityRelationUpsertAllowed(
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  if (relation.object_type === 'url') {
    await assertUrlObjectsAreValid(relation, objects, creator?.id ?? null, options)
    if (relation.subject_type === 'post' && relation.predicate === 'related') {
      await assertPostRelatedUrlsAllowed(creator, relation, subject, objects, options)
    }
  } else if (relation.object_type === 'topic') {
    if (relation.subject_type === 'topic' && relation.predicate === 'parent') {
      await assertTopicParentRelationsAreValid(relation, subject, objects)
    } else if (relation.subject_type === 'topic' && relation.predicate === 'publisher_type') {
      await assertPublisherTypeObjectsAreValid(relation, subject, objects)
    } else if (relation.subject_type === 'user' && relation.predicate === 'category') {
      await assertUserTagObjectsAreValid(relation, objects)
    }
  }
  if (relation.table_name === 'relation__post__related__url') return
  return assertRelationLimit(
    relation,
    subject.id,
    objects.map(object => object.id),
    options,
  )
}

/** Recheck state-dependent constraints after the mutation's canonical locks are held. */
export async function assertEntityRelationUpsertAllowedInTransaction(
  query: TransactionQuery,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  if (relation.table_name === 'relation__post__related__url')
    await assertRelationLimit(
      relation,
      subject.id,
      objects.map(object => object.id),
      {
        ...options,
        query,
      },
    )
  await assertPublisherTypeObjectsAreValidInTransaction(query, relation, subject, objects)
}
