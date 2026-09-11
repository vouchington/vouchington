import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordMembershipEntitlementEffect } from './entitlement-effects.mts'
import type { MembershipChangeType } from './types.mts'

export class DuplicateStripeMembershipEventError extends Error {
  constructor() {
    super('Stripe event already recorded for a membership change')
  }
}

export async function recordMembershipChange(options: {
  membershipId: string
  userId: string
  membershipSourceId?: string | null
  membershipGrantId?: string | null
  changeType: MembershipChangeType
  fromSkuId?: string | null
  toSkuId?: string | null
  cancelledAt?: Date | null
  expiredAt?: Date | null
  pastDueAt?: Date | null
  pausedAt?: Date | null
  cancelAtPeriodEnd?: boolean
  changedById?: string | null
  note?: string | null
  membershipProviderEvidenceId?: string | null
  stripeEventId?: string | null
  ignoreDuplicateStripeEvent?: boolean
  query?: QueryExecutor
}): Promise<boolean> {
  if (!options.query) {
    await using query = await beginTransaction()
    const result = await recordMembershipChange({ ...options, query })
    await query.commit()
    return result
  }

  const run = options.query ?? write
  const statement = sql`/* recordMembershipChange */
    INSERT INTO membership_changes (
      membership_id,
      user_id,
      membership_source_id,
      membership_grant_id,
      change_type,
      from_membership_product_id,
      to_membership_product_id,
      changed_by_id,
      note,
      stripe_event_id,
      membership_provider_evidence_id,
      cancelled_at, expired_at, past_due_at, paused_at, cancel_at_period_end
    ) VALUES (
      ${options.membershipId},
      ${options.userId},
      COALESCE(
        ${options.membershipSourceId ?? null}::uuid,
        (SELECT membership_source_id FROM memberships WHERE id = ${options.membershipId})
      ),
      COALESCE(
        ${options.membershipGrantId ?? null}::uuid,
        (
          SELECT membership_grant.id
          FROM memberships membership
          INNER JOIN membership_grants membership_grant
            ON membership_grant.membership_source_id = membership.membership_source_id
          WHERE membership.id = ${options.membershipId}
        )
      ),
      ${options.changeType}::membership_change_types,
      ${options.fromSkuId ?? null}::uuid,
      ${options.toSkuId ?? null}::uuid,
      ${options.changedById ?? null}::uuid,
      ${options.note ?? null}::text,
      ${options.stripeEventId ?? null}::text,
      ${options.membershipProviderEvidenceId ?? null}::uuid,
      ${options.cancelledAt ?? null}::timestamptz, ${options.expiredAt ?? null}::timestamptz,
      ${options.pastDueAt ?? null}::timestamptz, ${options.pausedAt ?? null}::timestamptz,
      ${options.cancelAtPeriodEnd ?? false}::boolean
    )`
  if (options.ignoreDuplicateStripeEvent) {
    statement.append(
      sql` ON CONFLICT (stripe_event_id) WHERE stripe_event_id IS NOT NULL DO NOTHING`,
    )
  }
  statement.append(sql` RETURNING id`)
  const { rows } = await run(statement)
  const change = rows[0] as { id: string }
  if (!change) return false

  await recordMembershipEntitlementEffect(change.id, options.userId, run)

  await run(sql`/* recordMembershipChange:updateLatest */
    UPDATE memberships m
    SET latest_change_id = ${change.id}
    FROM membership_changes new_change
    WHERE m.id = ${options.membershipId}
      AND new_change.id = ${change.id}
      AND (
        m.latest_change_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM membership_changes current_change
          WHERE current_change.id = m.latest_change_id
            AND (
              current_change.created_at < new_change.created_at
              OR (
                current_change.created_at = new_change.created_at
                AND current_change.id < new_change.id
              )
            )
        )
      )
  `)
  return true
}
