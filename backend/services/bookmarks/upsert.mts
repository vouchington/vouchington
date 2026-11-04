import { castFollowUserVouches } from './follow-user-vouches.mts'
// Self-register the bloom handler so bookmark writes work even when this file is
// loaded via a subpath import that bypasses the package barrel.
import './register-bookmark-bloom-handler.mts'
import {
  upsertEntityRelation,
  type UpsertEntityRelationOptions,
} from '@services/entity-relations/upsert'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import {
  entityRelationMetadatum,
  getEntityRelationMetadataOrThrow,
} from '@services/entity-relations/metadata'
import type {
  EntityRelationEntityType,
  EntityRelationPredicateType,
} from '@services/entity-relations/config'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  enqueueBulkRefreshPostMetricsById,
  enqueueBulkRefreshTopicMetricsById,
  enqueueBulkRefreshUserMetricsById,
} from '@queues/vote-aggregation/enqueues/entity-metrics-cache-refresh'
import onError from '@modules/on-error'
import assert from 'http-assert'

// When a user creates one of these bookmarks, implicitly remove their follow
// on the same entity. This keeps mute/block congruent with unfollow.
// Note: muting a *user* does NOT unfollow (users may want to stay connected).
const IMPLICIT_UNFOLLOW: Partial<Record<string, EntityRelationPredicateType>> = {
  'topic:mute': 'follow',
  'topic:block': 'follow',
  'user:block': 'follow',
  'rss_feed:mute': 'follow',
  'community:proxy_mute': 'proxy_follow',
}

const invalidateFollowMetrics = async (
  entityTypeName: EntityRelationEntityType,
  userId: string,
  entityIds: string[],
) => {
  try {
    switch (entityTypeName) {
      case 'topic':
        await Promise.all([
          enqueueBulkRefreshTopicMetricsById(entityIds),
          /* c8 ignore next -- lint-only explicit enqueue disposition. */
          enqueueBulkRefreshUserMetricsById([userId]),
        ])
        break
      case 'post':
        await Promise.all([
          enqueueBulkRefreshPostMetricsById(entityIds),
          /* c8 ignore next -- lint-only explicit enqueue disposition. */
          enqueueBulkRefreshUserMetricsById([userId]),
        ])
        break
      case 'user':
        await enqueueBulkRefreshUserMetricsById([userId, ...entityIds])
        break
      case 'rss_feed':
        await enqueueBulkRefreshUserMetricsById([userId])
        break
      default:
        break
    }
  } catch (err) {
    onError(err as Error)
  }
}

export const bookmarkEntities = async (
  user: PrivateUser,
  entityTypeName: EntityRelationEntityType,
  entities: Array<{ id: string }>,
  predicate: EntityRelationPredicateType,
  // Only a trusted command's state-dependent authorization recheck, run inside the write.
  options?: Pick<UpsertEntityRelationOptions, 'postMutationGuard'>,
) => {
  const relationData = entityRelationMetadatum.find(
    r => r.subject_type === 'user' && r.object_type === entityTypeName && r.predicate === predicate,
  )
  assert(relationData?.is_bookmark, 422, 'Invalid bookmark type.')

  const relations = await upsertEntityRelation(user, relationData, user, entities, options)

  const unfollowPredicate = IMPLICIT_UNFOLLOW[`${entityTypeName}:${predicate}`]
  if (unfollowPredicate) {
    const followRelationData = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: entityTypeName,
      predicate: unfollowPredicate,
    })
    await softDeleteEntityRelation(user, followRelationData, user, entities)
    await invalidateFollowMetrics(
      entityTypeName,
      user.id,
      entities.map(entity => entity.id),
    )
  }

  if (predicate === 'follow') {
    await invalidateFollowMetrics(
      entityTypeName,
      user.id,
      entities.map(entity => entity.id),
    )
    if (entityTypeName === 'user')
      await castFollowUserVouches(
        user,
        entities.map(entity => entity.id),
      )
  }

  return relations
}

export async function bookmarkEntity(
  user: PrivateUser,
  entityTypeName: EntityRelationEntityType,
  entity: { id: string },
  predicate: EntityRelationPredicateType,
  options?: Pick<UpsertEntityRelationOptions, 'postMutationGuard'>,
) {
  const [relation] = await bookmarkEntities(user, entityTypeName, [entity], predicate, options)
  return relation
}

export const unbookmarkEntity = async (
  user: PrivateUser,
  entityTypeName: EntityRelationEntityType,
  entity: { id: string },
  predicate: EntityRelationPredicateType,
) => {
  const relationData = entityRelationMetadatum.find(
    r => r.subject_type === 'user' && r.object_type === entityTypeName && r.predicate === predicate,
  )
  assert(relationData?.is_bookmark, 422, 'Invalid bookmark type.')

  await softDeleteEntityRelation(user, relationData, user, [entity])

  // Bloom filters do not support deletions — unbookmarked entries remain as false positives.
  // The DB lookup in getBookmarksForEntities handles false positives correctly.
  if (predicate === 'follow') {
    await invalidateFollowMetrics(entityTypeName, user.id, [entity.id])
  }
}
