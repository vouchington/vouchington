import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getUserActivePlan } from '@services/memberships'
import { isAdminUser } from '@services/users'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { getContributionQuota } from '@services/contribution-gating/quota'
import { getContributionActionLimitStatus } from '@services/contribution-gating/limits'
import { getContributionAdmissionCapacityStatus } from '@services/contribution-gating/admission-capacity-status'
import { getContributionPolicyConfigSnapshot } from '@services/contribution-gating/limits-config'
import { createContributionPolicyActor } from '@services/contribution-gating/policy-actor'
import {
  resolveContributionPolicy,
  type ContributionPolicySource,
} from '@services/contribution-gating/policy'
import {
  contributionLimitActions,
  type ContributionLimitAction,
} from '@services/contribution-gating/limit-types'

// GET /api/v1/my/contribution-status
app.route('/api/v1/my/contribution-status').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/contribution-status')

  const membershipPlan = await getUserActivePlan(currentUser.id)
  const isAdmin = isAdminUser(currentUser)
  const action = parseContributionLimitAction(ctx, ctx.query.action)
  const source = sourceForContributionAction(action)
  const actionLimit = action
    ? getContributionActionLimitStatus(currentUser, membershipPlan, action)
    : null
  const [contribution_status, legacyQuota, action_limit] = await Promise.all([
    getContributionStatus(currentUser, { membershipPlan }),
    getContributionQuota(currentUser.id, isAdmin, membershipPlan),
    actionLimit,
  ])
  const daily_quota = action_limit?.daily_window ?? legacyQuota
  const admission =
    !contribution_status.allowed || isAdmin
      ? { allowed: contribution_status.allowed }
      : await getContributionAdmissionCapacityStatus(
          currentUser.id,
          source,
          resolveContributionPolicy(
            getContributionPolicyConfigSnapshot(),
            createContributionPolicyActor(currentUser.id, membershipPlan),
            source,
          ),
        )

  ctx.json({
    contribution_status,
    daily_quota,
    ...(action_limit ? { action_limit } : {}),
    admission: {
      allowed: admission.allowed,
      ...(admission.reason ? { reason: admission.reason } : {}),
      ...(admission.retryAfterSeconds ? { retry_after_seconds: admission.retryAfterSeconds } : {}),
    },
  })
})

function parseContributionLimitAction(
  ctx: Context,
  value: unknown,
): ContributionLimitAction | null {
  if (value === undefined) return null
  if (typeof value !== 'string') ctx.throw(400, 'Invalid action')
  if (contributionLimitActions.includes(value as ContributionLimitAction)) {
    return value as ContributionLimitAction
  }
  ctx.throw(400, 'Invalid action')
  return null
}

function sourceForContributionAction(
  action: ContributionLimitAction | null,
): ContributionPolicySource {
  if (action === 'review' || action === 'comment' || action === 'data_point') return action
  if (action === 'topic_recommendation') return action
  return 'discussion'
}
