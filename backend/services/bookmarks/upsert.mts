// Self-register the bloom handler so bookmark writes work even when this file is
// loaded via a subpath import that bypasses the package barrel.
import './register-bookmark-bloom-handler.mts'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
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
} from '@queues/entity-metrics-cache-refresh/enqueues'
import { upsertUserVouchElectionVotes } from '@services/elections-votes/user-vouch'
import { getPublicUserByAny, isAdminUser, isOfficialAccount } from '@services/users'
import { getUserActivePlan } from '@services/memberships'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { getContributionQuota } from '@services/contribution-gating/quota'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import onError from '@modules/on-error'
import assert from 'http-assert'

// The bookmarks PUT route has no per-route rate limiting (unlike the explicit vouch-vote route),
// so the implicit vouch cast below needs its own throttle. A dedicated prefix (rather than sharing
// 'user-vouch-election-vote') keeps follow volume from starving the explicit route's disavow budget.
// Threshold 31 allows 30 casts per window (addAndCheck adds before counting), matching the
// explicit vouch-vote route's own budget.
const followVouchRateLimiter = new RateLimiter({ prefix: 'user-follow-vouch-cast', ttlSeconds: 60 })

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
  } catch (error) {
    onError(error as Error)
  }
}

export const bookmarkEntity = async (
  user: PrivateUser,
  entityTypeName: EntityRelationEntityType,
  entity: { id: string },
  predicate: EntityRelationPredicateType,
) => {
  const relationData = entityRelationMetadatum.find(
    r => r.subject_type === 'user' && r.object_type === entityTypeName && r.predicate === predicate,
  )
  assert(relationData?.is_bookmark, 422, 'Invalid bookmark type.')

  const relations = await upsertEntityRelation(user, relationData, user, [entity])

  const unfollowPredicate = IMPLICIT_UNFOLLOW[`${entityTypeName}:${predicate}`]
  if (unfollowPredicate) {
    const followRelationData = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: entityTypeName,
      predicate: unfollowPredicate,
    })
    await softDeleteEntityRelation(user, followRelationData, user, [entity])
    await invalidateFollowMetrics(entityTypeName, user.id, [entity.id])
  }

  if (predicate === 'follow') {
    await invalidateFollowMetrics(entityTypeName, user.id, [entity.id])
    // Following a user is a trust signal — auto-cast Like (+1) (issue #7257).
    // Official accounts and contribution-ineligible accounts must never create trust signals
    // (docs/requirements/trust-safety/reference-trust-system-overview.md#mechanics) — skip the cast
    // rather than failing the follow. Deliberately does not consume the daily contribution quota:
    // quota throttles the volume of deliberate contribution actions (posts, votes), and folding an
    // incidental follow side-effect into that shared counter would starve a very active follower's
    // unrelated contributions for the rest of the day.
    if (
      entityTypeName === 'user' &&
      entity.id.toLowerCase() !== user.id.toLowerCase() &&
      !isOfficialAccount(user)
    ) {
      try {
        const membershipPlan = await getUserActivePlan(user.id)
        const isAdmin = isAdminUser(user)
        const [contributionStatus, contributionQuota, { limited }, target] = await Promise.all([
          getContributionStatus(user, { membershipPlan, skipAccountAgeGate: true }),
          getContributionQuota(user.id, isAdmin, membershipPlan),
          followVouchRateLimiter.addAndCheck([`uid:${user.id}`], 31),
          // Soft-deleted users remain in `users` (only the FK target, not deleted_at, is
          // enforced above), so resolve through the same deleted_at-filtered lookup the
          // explicit vouch route uses before casting a vouch for a deleted account.
          getPublicUserByAny(entity.id),
        ])
        // A daily quota already used up by explicit posts/votes must also cap this incidental
        // cast -- otherwise following is an unmetered way around assertWithinContributionQuota.
        // Read-only (getContributionQuota, not assertWithinContributionQuota): the cast itself
        // must still never consume the shared counter (see the block comment above).
        const withinQuota =
          contributionQuota.limit === -1 || contributionQuota.used < contributionQuota.limit
        if (contributionStatus.allowed && withinQuota && !limited && target) {
          await upsertUserVouchElectionVotes(user.id, [{ entityId: entity.id, score: 1 }])
        }
      } catch (error) {
        // Unreachable without mocking (banned for @services/* in backend tests): the membership,
        // contribution-status/quota, and target lookups plus the rate limiter only throw on infra
        // outages, and the vouch upsert shares the same users(id) FK as the follow-relation insert
        // above, so a real target-FK failure would already reject that earlier, uncaught insert first.
        /* c8 ignore next -- see comment above; no realistic non-mocked trigger */
        onError(error as Error)
      }
    }
  }

  return relations[0]
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
