import { beginTransaction, registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DuplicateStripeMembershipEventError } from './changes.mts'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import { markJwtStale } from '@data-stores/valkey/jwt-stale'
import onError from '@modules/on-error'
import { enqueueUnfurledChildRemovalOnDowngrade } from './paid-tier-downgrade.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction } from './grants/resume-after-direct-termination.mts'
import {
  isTerminalMembershipStatus,
  parseMembershipUpdateRow,
  type MembershipUpdateResult,
  type MembershipUpdateRow,
} from './update-result.mts'
import { appendLifecycleSetClauses } from './update-lifecycle.mts'
import type {
  MembershipEventUpdateOptions,
  RecordMembershipUpdateEventChange,
} from './update/event-types.mts'

type MembershipEventUpdateOutcome = {
  membership: MembershipUpdateResult
  retainsPaidAccess: boolean
}

export async function updateMembershipFromEvent(
  options: MembershipEventUpdateOptions,
  recordChange: RecordMembershipUpdateEventChange,
): Promise<MembershipUpdateResult | null> {
  const setClauses = [sql`updated_at = CURRENT_TIMESTAMP`]

  if (options.status !== undefined) {
    appendLifecycleSetClauses(setClauses, options.status, options)
  }
  if (options.skuId !== undefined) {
    setClauses.push(sql`membership_product_id = ${options.skuId}`)
  }
  if (options.expiresAt !== undefined) {
    setClauses.push(sql`expires_at = ${options.expiresAt}`)
  }
  if (options.effectiveAt) {
    setClauses.push(sql`effective_at = ${options.effectiveAt}`)
  }
  if (options.cancelAtPeriodEnd !== undefined) {
    const isTerminal = options.status !== undefined && isTerminalMembershipStatus(options.status)
    if (!isTerminal) setClauses.push(sql`cancel_at_period_end = ${options.cancelAtPeriodEnd}`)
  }

  const query = sql`/* updateMembershipFromEvent */ UPDATE memberships SET `
  for (let i = 0; i < setClauses.length; i++) {
    if (i > 0) query.append(sql`, `)
    query.append(setClauses[i])
  }
  query.append(sql`
    WHERE id = ${options.membershipId}
      AND projection_ended_at IS NULL
      AND (
        ${options.membershipSourceId ?? null}::uuid IS NULL
        OR membership_source_id = ${options.membershipSourceId ?? null}::uuid
      )
      AND (
        (cancelled_at IS NULL AND expired_at IS NULL)
        OR ${options.status ?? null}::text NOT IN ('active', 'past_due', 'paused')
      )
    RETURNING WITH (OLD AS old, NEW AS new)
      old.user_id AS previous_user_id,
      (SELECT plan FROM membership_products WHERE id = old.membership_product_id) AS previous_plan,
      old.membership_product_id AS previous_sku_id,
      CASE
        WHEN old.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN old.expired_at IS NOT NULL THEN 'expired'
        WHEN old.paused_at IS NOT NULL THEN 'paused'
        WHEN old.past_due_at IS NOT NULL THEN 'past_due'
        ELSE 'active'
      END AS previous_status,
      old.expires_at AS previous_expires_at,
      old.cancelled_at AS previous_cancelled_at,
      old.expired_at AS previous_expired_at,
      old.past_due_at AS previous_past_due_at,
      old.paused_at AS previous_paused_at,
      old.cancel_at_period_end AS previous_cancel_at_period_end,
      new.user_id AS current_user_id,
      (SELECT plan FROM membership_products WHERE id = new.membership_product_id) AS current_plan,
      new.membership_product_id AS current_sku_id,
      CASE
        WHEN new.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN new.expired_at IS NOT NULL THEN 'expired'
        WHEN new.paused_at IS NOT NULL THEN 'paused'
        WHEN new.past_due_at IS NOT NULL THEN 'past_due'
        ELSE 'active'
      END AS current_status,
      new.expires_at AS current_expires_at,
      new.cancelled_at AS current_cancelled_at,
      new.expired_at AS current_expired_at,
      new.past_due_at AS current_past_due_at,
      new.paused_at AS current_paused_at,
      new.cancel_at_period_end AS current_cancel_at_period_end
  `)

  const update = async (
    transaction: QueryExecutor,
  ): Promise<MembershipEventUpdateOutcome | null> => {
    await transaction(sql`/* updateMembershipFromEvent:lockUser */
      SELECT users.id FROM memberships membership
      INNER JOIN users ON users.id = membership.user_id
      WHERE membership.id = ${options.membershipId} FOR UPDATE OF users
    `)
    if (options.membershipSourceId !== undefined && options.status === 'cancelled') {
      await transaction(sql`/* updateMembershipFromEvent:detachedSourceState */
        UPDATE membership_source_states
        SET cancelled_at = COALESCE(cancelled_at, COALESCE(
          ${options.terminalEffectiveAt ?? null}::timestamptz, CURRENT_TIMESTAMP)),
            expired_at = NULL,
            past_due_at = NULL,
            paused_at = NULL,
            auto_renews = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE membership_source_id = ${options.membershipSourceId}
      `)
    }
    const { rows } = await transaction(query)
    const updated = parseMembershipUpdateRow(rows[0] as MembershipUpdateRow | undefined)
    if (!updated) return null
    await transaction(sql`/* updateMembershipFromEvent:sourceState */
      UPDATE membership_source_states state
      SET membership_product_id = membership.membership_product_id,
          effective_at = membership.effective_at,
          expires_at = membership.expires_at,
          cancelled_at = membership.cancelled_at,
          expired_at = membership.expired_at,
          past_due_at = membership.past_due_at,
          paused_at = membership.paused_at,
          auto_renews = state.source_kind = 'direct'
            AND membership.cancelled_at IS NULL
            AND membership.expired_at IS NULL
            AND NOT membership.cancel_at_period_end
      FROM memberships membership
      WHERE membership.id = ${options.membershipId}
        AND state.membership_source_id = membership.membership_source_id
    `)
    const retainsPaidAccess = (await recordChange(updated, transaction)) ?? false
    const resumedAccess =
      !['active', 'past_due'].includes(updated.current.status) &&
      updated.current.status !== updated.previous.status
        ? await resumeGrantAfterDirectAccessSuspensionInTransaction(
            updated.current.user_id,
            options.membershipId,
            transaction,
          )
        : null
    return {
      membership: updated,
      retainsPaidAccess: retainsPaidAccess || !!resumedAccess?.retainsPaidAccess,
    }
  }
  let outcome: MembershipEventUpdateOutcome | null
  try {
    if (options.query) outcome = await update(options.query)
    else {
      await using transaction = await beginTransaction()
      outcome = await update(transaction)
      await transaction.commit()
    }
  } catch (error) {
    if (!options.query && error instanceof DuplicateStripeMembershipEventError) return null
    throw error
  }
  const membership = outcome?.membership ?? null
  if (!membership) return null
  const dispatchEffects = async (): Promise<void> => {
    void enqueueRecalculateUserVoteWeight(membership.current.user_id, true)
    markJwtStale(membership.current.user_id).catch(onError)
    enqueueUnfurledChildRemovalOnDowngrade(membership, outcome?.retainsPaidAccess ?? false)
  }
  if (options.query) registerPostCommitAction(options.query, dispatchEffects)
  else await dispatchEffects()
  return membership
}

export { cancelMembership } from './update-cancellation.mts'
