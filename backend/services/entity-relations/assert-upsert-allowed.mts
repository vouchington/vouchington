import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'
import { assertPostRelatedUrlsAllowed } from './assert-post-related-urls-allowed.mts'
import { assertPublisherTypeObjectsAreValid } from './assert-publisher-type-relation.mts'
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
  await assertPostRelatedUrlsAllowed(creator, relation, subject, objects)
}
