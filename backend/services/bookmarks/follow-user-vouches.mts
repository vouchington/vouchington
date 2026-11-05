import type { PrivateUser } from '@voucha/types/entities/user'
import { getPublicUsersByAnyBatch } from '@services/users/get-public-batch'
import { isAdminUser, isPlatformAccount } from '@services/users'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { getContributionQuota } from '@services/contribution-gating/quota'
import { upsertUserVouchElectionVotes } from '@services/elections-votes/user-vouch'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import onError from '@modules/on-error'

// Independent from explicit vouch voting: incidental casts must not starve disavows.
const followVouchRateLimiter = new RateLimiter({ prefix: 'user-follow-vouch-cast', ttlSeconds: 60 })

/** A follow may cast a vouch, but a vouch failure never undoes a successful follow. */
export async function castFollowUserVouches(
  user: PrivateUser,
  entityIds: readonly string[],
): Promise<void> {
  if (isPlatformAccount(user)) return
  const ids = [...new Set(entityIds.map(id => id.toLowerCase()))].filter(
    id => id !== user.id.toLowerCase(),
  )
  if (ids.length === 0) return
  try {
    const membershipPlan = user.membership_plan ?? null
    const [status, quota, targets] = await Promise.all([
      getContributionStatus(user, { membershipPlan, skipAccountAgeGate: true }),
      getContributionQuota(user.id, isAdminUser(user), membershipPlan),
      getPublicUsersByAnyBatch(ids, { readOnly: false }),
    ])
    // Incidental casts never consume contribution quota, but an exhausted quota still blocks them.
    const withinQuota = quota.limit === -1 || quota.used < quota.limit
    const votes: Array<{ entityId: string; score: 1 }> = []
    for (const [index, id] of ids.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- each decision must include the preceding target's consumed rate-limit unit
      const { limited } = await followVouchRateLimiter.addAndCheck([`uid:${user.id}`], 31)
      if (status.allowed && withinQuota && !limited && targets[index])
        votes.push({ entityId: id, score: 1 })
    }
    if (votes.length > 0) await upsertUserVouchElectionVotes(user.id, votes)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
