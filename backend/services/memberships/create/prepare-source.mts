import { registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createSource, getMembershipProductIdForCreation } from '../create-source.mts'
import {
  getStripeMembershipSourceIdentity,
  type CreateMembershipOptions,
} from '../create-types.mts'
import { assertDirectMembershipSourceAdmission } from '../direct-source-authority.mts'
import { expireElapsedMemberships } from '../grants/expire-elapsed.mts'
import { isTerminalMembershipStatus } from '../update-result.mts'
import { isHigherMembershipPlan } from '../plan-ranking.mts'
import type { MembershipPlanSlug } from '../types.mts'

export type FamilyMembershipSourceProjectionAdmission =
  | { accepted: true }
  | {
      accepted: false
      currentMembershipId: string
      currentSourceKind: 'admin_grant' | 'direct' | 'family'
    }

/**
 * Locks the current projection before an external provider projects family access. Family
 * evidence is retained even when this rejects projection, so it can become the fallback once a
 * higher-priority source ends.
 */
export async function getFamilyMembershipSourceProjectionAdmission(
  options: {
    userId: string
    membershipSourceId: string
    plan: MembershipPlanSlug
    effectiveAt: Date
  },
  query: QueryExecutor,
): Promise<FamilyMembershipSourceProjectionAdmission> {
  const { rows } = await query(sql`/* getFamilyMembershipSourceProjectionAdmission */
    SELECT membership.id, membership.membership_source_id, product.plan, membership.effective_at,
      source.source_kind
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_products product ON product.id = membership.membership_product_id
    WHERE membership.user_id = ${options.userId}
      AND membership.projection_ended_at IS NULL
      AND membership.cancelled_at IS NULL
      AND membership.expired_at IS NULL
      AND membership.paused_at IS NULL
    FOR UPDATE OF membership`)
  const current = rows[0] as
    | {
        id: string
        membership_source_id: string
        plan: MembershipPlanSlug
        effective_at: Date
        source_kind: 'admin_grant' | 'direct' | 'family'
      }
    | undefined
  if (!current || current.membership_source_id === options.membershipSourceId)
    return { accepted: true }
  if (isHigherMembershipPlan(options.plan, current.plan)) return { accepted: true }
  if (isHigherMembershipPlan(current.plan, options.plan))
    return {
      accepted: false,
      currentMembershipId: current.id,
      currentSourceKind: current.source_kind,
    }
  if (current.source_kind !== 'family')
    return {
      accepted: false,
      currentMembershipId: current.id,
      currentSourceKind: current.source_kind,
    }
  if (options.effectiveAt > current.effective_at) return { accepted: true }
  return {
    accepted: false,
    currentMembershipId: current.id,
    currentSourceKind: current.source_kind,
  }
}

export async function prepareMembershipCreation(
  options: CreateMembershipOptions,
  query: QueryExecutor,
  enqueueEntitlementEffects: () => void,
  directTermEffectiveAt: Date | undefined,
) {
  const productId = await getMembershipProductIdForCreation(options, query)
  const expiredMemberships = await expireElapsedMemberships(options.userId, query, {
    expiresThrough: directTermEffectiveAt,
  })
  if (expiredMemberships > 0) enqueueEntitlementEffectsAfterCommit(query, enqueueEntitlementEffects)
  const directStatus = options.status ?? 'active'
  if (
    options.stripeSubscriptionId &&
    directStatus !== 'paused' &&
    !isTerminalMembershipStatus(directStatus)
  )
    await assertDirectMembershipSourceAdmission(
      options.userId,
      options.plan,
      getStripeMembershipSourceIdentity(options),
      query,
    )
  return lockPriorProjectionAndCreateSource(options, productId, query)
}

async function lockPriorProjectionAndCreateSource(
  options: CreateMembershipOptions,
  productId: string,
  query: QueryExecutor,
) {
  const { rows: priorRows } = await query(
    sql`/* createMembership: lock prior effective product */
      SELECT membership.id, membership.membership_source_id, membership.membership_product_id,
        product.plan, membership.expires_at, membership.cancelled_at, membership.expired_at,
        membership.past_due_at, membership.paused_at, membership.cancel_at_period_end,
        membership.projection_ended_at,
        source.source_kind
      FROM memberships membership
      INNER JOIN membership_sources source ON source.id = membership.membership_source_id
      INNER JOIN membership_products product ON product.id = membership.membership_product_id
      WHERE membership.user_id = ${options.userId}
        AND membership.projection_ended_at IS NULL FOR UPDATE OF membership`,
  )
  const source = await createSource(options, productId, query)
  const retainedSourceRows =
    source.kind === 'direct' ? await lockRetainedDirectSourceProjection(source.id, query) : []
  return { productId, priorRows, retainedSourceRows, source }
}

async function lockRetainedDirectSourceProjection(sourceId: string, query: QueryExecutor) {
  const { rows } = await query(
    sql`/* createMembership: lock retained direct source projection */
      SELECT membership.id, membership.membership_source_id, membership.membership_product_id,
        product.plan, membership.expires_at, membership.cancelled_at, membership.expired_at,
        membership.past_due_at, membership.paused_at, membership.cancel_at_period_end,
        membership.projection_ended_at,
        source.source_kind
      FROM memberships membership
      INNER JOIN membership_sources source ON source.id = membership.membership_source_id
      INNER JOIN membership_products product ON product.id = membership.membership_product_id
      WHERE membership.membership_source_id = ${sourceId}
        AND membership.projection_ended_at IS NOT NULL
      ORDER BY membership.projection_ended_at DESC, membership.created_at DESC, membership.id DESC
      LIMIT 1
      FOR UPDATE OF membership`,
  )
  return rows
}

function enqueueEntitlementEffectsAfterCommit(
  query: QueryExecutor,
  enqueueEntitlementEffects: () => void,
): void {
  registerPostCommitAction(query, () => {
    void enqueueEntitlementEffects()
    return Promise.resolve()
  })
}
