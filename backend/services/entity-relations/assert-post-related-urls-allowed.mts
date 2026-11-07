import assert from 'http-assert'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'
import { assertRelationLimits } from './relation-limits.mts'
import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import { getEntityId, type EntityIdentifier, type UpsertEntityTypes } from './upsert-helpers.mts'
import { getRegisteredPostRelatedUrlsGuard } from './post-related-urls-guard-registry.mts'

export async function assertPostRelatedUrlsAllowed(
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  await assertPostRelatedUrlsAllowedForSubjects(creator, relation, [{ subject, objects }], options)
}

export async function assertPostRelatedUrlsAllowedForSubjects(
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  groups: readonly {
    subject: UpsertEntityTypes | EntityIdentifier
    objects: Array<UpsertEntityTypes | EntityIdentifier>
  }[],
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  if (
    relation.subject_type !== 'post' ||
    relation.predicate !== 'related' ||
    relation.object_type !== 'url'
  ) {
    return
  }
  // No relation config today points a post/related/url relation at a null (remote-actor)
  // creator — throw rather than silently skip the guard if one ever does.
  assert(creator, 500, 'Post-related-url entity relations require a non-null creator')

  const subjects = groups.map(({ subject, objects }) => ({
    relation,
    subjectId: getEntityId(subject),
    objectIds: objects.map(getEntityId),
    skipIfDeleted: options?.skipIfDeleted,
  }))
  await assertRelationLimits(subjects, options)
  const guard = getRegisteredPostRelatedUrlsGuard()
  await Promise.all(
    subjects.map(group => guard(creator, group.subjectId, group.objectIds, options)),
  )
}
