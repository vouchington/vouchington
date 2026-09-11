import assert from 'http-assert'
import type { QueryOptions } from '@data-stores/psql/types'
import type { BasicUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from './metadata.mts'
import { getEntityId, type EntityIdentifier, type UpsertEntityTypes } from './upsert-helpers.mts'
import { getRegisteredPostRelatedUrlsGuard } from './post-related-urls-guard-registry.mts'

export async function assertPostRelatedUrlsAllowed(
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  options?: QueryOptions,
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

  await getRegisteredPostRelatedUrlsGuard()(
    creator,
    getEntityId(subject),
    objects.map(object => getEntityId(object)),
    options,
  )
}
