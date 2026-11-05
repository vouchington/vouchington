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
  // ast-grep-ignore: no-three-sequential-awaits -- guards intentionally run in their established order
  await assertTopicParentRelationsAreValid(relation, subject, objects)
  await assertUrlObjectsAreValid(relation, objects, creator?.id ?? null, options)
  await assertPublisherTypeObjectsAreValid(relation, subject, objects)
  await assertUserTagObjectsAreValid(relation, objects)
  await assertPostRelatedUrlsAllowed(creator, relation, subject, objects, options)
  if (relation.table_name === 'relation__post__related__url') return
  await assertRelationLimit(
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
