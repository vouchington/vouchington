import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordMembershipChange } from '../changes.mts'
import { activateOldestQueuedGrant } from '../grants/activate-queued.mts'
import { pauseOpenGrantActivations } from '../grants/pause-open-activations.mts'
import type { MembershipPlanSlug } from '../types.mts'
import { moveRenewalPriceIncreaseNotificationState } from './renewal-notification-state.mts'
import { retainOldestQueuedGrantPerPlan } from './retain-oldest-queued-grant-per-plan.mts'
import { selectHighestPriorityMembershipSource } from './select-highest-priority-source.mts'

type CurrentMembership = {
  access_ended_at: Date
  id: string
  membership_product_id: string
  membership_source_id: string
}

type ValidFallbackSource = {
  auto_renews: boolean
  effective_at: Date
  expires_at: Date | null
  grant_created_at: Date | null
  has_open_grant_activation: boolean
  membership_product_id: string
  membership_source_id: string
  past_due_at: Date | null
  plan: MembershipPlanSlug
  source_kind: 'admin_grant' | 'direct' | 'family'
}

/**
 * Reprojects the highest-priority valid source after a terminal current projection. This preserves
 * a retained direct term or active administrator grant when a family source is invalidated.
 */
export async function restoreFallbackAfterCurrentAccessEndsInTransaction(
  userId: string,
  membershipId: string,
  query: QueryExecutor,
  options: { membershipSourceId?: string } = {},
): Promise<boolean> {
  await query(sql`/* restoreFallbackAfterCurrentAccessEnds: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const current = await getTerminalCurrentMembership(userId, membershipId, query)
  if (!current) return false
  const fallback = await getHighestPriorityFallbackSource(
    userId,
    current.membership_source_id,
    query,
    options.membershipSourceId,
  )
  if (!fallback) return false
  if (
    fallback.source_kind === 'direct' ||
    (fallback.source_kind === 'admin_grant' && !fallback.has_open_grant_activation)
  )
    await pauseOpenGrantActivations(userId, current.access_ended_at, query)
  if (fallback.source_kind === 'admin_grant' && !fallback.has_open_grant_activation)
    return activateOldestQueuedGrant(
      userId,
      {
        id: current.id,
        membership_product_id: current.membership_product_id,
        membership_source_id: current.membership_source_id,
        expires_at: current.access_ended_at,
      },
      query,
      current.access_ended_at,
      fallback.membership_source_id,
    )
  const renewalNotification =
    fallback.source_kind === 'direct'
      ? await moveRenewalPriceIncreaseNotificationState(fallback.membership_source_id, query)
      : undefined
  await query(sql`/* restoreFallbackAfterCurrentAccessEnds: retire current */
    UPDATE memberships SET projection_ended_at = CURRENT_TIMESTAMP
    WHERE id = ${current.id} AND projection_ended_at IS NULL`)
  const { rows } = await query(sql`/* restoreFallbackAfterCurrentAccessEnds: project fallback */
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at,
      cancelled_at, expired_at, past_due_at, paused_at, cancel_at_period_end,
      renewal_price_increase_notified_observation_id,
      renewal_price_increase_notified_provider_product_id,
      renewal_price_increase_notified_minor_units,
      renewal_price_increase_notified_currency_code,
      renewal_price_increase_notified_effective_at, renewal_price_increase_notified_at,
      renewal_price_increase_claim_token, renewal_price_increase_claimed_at,
      renewal_price_increase_delivery_attempted_at
    ) VALUES (
      ${userId}, ${fallback.membership_source_id}, ${fallback.membership_product_id},
      ${fallback.effective_at}, ${fallback.expires_at}, NULL, NULL,
      ${fallback.source_kind === 'direct' ? fallback.past_due_at : null}, NULL,
      ${fallback.source_kind === 'direct' && !fallback.auto_renews},
      ${renewalNotification?.renewal_price_increase_notified_observation_id ?? null},
      ${renewalNotification?.renewal_price_increase_notified_provider_product_id ?? null},
      ${renewalNotification?.renewal_price_increase_notified_minor_units ?? null},
      ${renewalNotification?.renewal_price_increase_notified_currency_code ?? null},
      ${renewalNotification?.renewal_price_increase_notified_effective_at ?? null},
      ${renewalNotification?.renewal_price_increase_notified_at ?? null},
      ${renewalNotification?.renewal_price_increase_claim_token ?? null},
      ${renewalNotification?.renewal_price_increase_claimed_at ?? null},
      ${renewalNotification?.renewal_price_increase_delivery_attempted_at ?? null}
    ) RETURNING id`)
  const restored = rows[0] as { id: string } | undefined
  if (!restored) return false
  await recordMembershipChange({
    membershipId: restored.id,
    userId,
    membershipSourceId: fallback.membership_source_id,
    changeType: 'reactivation',
    fromSkuId: current.membership_product_id,
    toSkuId: fallback.membership_product_id,
    pastDueAt: fallback.source_kind === 'direct' ? fallback.past_due_at : null,
    cancelAtPeriodEnd: fallback.source_kind === 'direct' && !fallback.auto_renews,
    query,
  })
  return true
}

async function getTerminalCurrentMembership(
  userId: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<CurrentMembership | undefined> {
  const { rows } = await query(sql`/* restoreFallbackAfterCurrentAccessEnds: current */
    SELECT membership.id, membership.membership_product_id, membership.membership_source_id,
      COALESCE(
        membership.cancelled_at, membership.expired_at, membership.paused_at,
        source_state.cancelled_at, source_state.expired_at, source_state.paused_at,
        CURRENT_TIMESTAMP
      ) AS access_ended_at
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
    WHERE membership.id = ${membershipId} AND membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND (
        (source.source_kind IN ('direct', 'family') AND (
          source_state.cancelled_at IS NOT NULL OR source_state.expired_at IS NOT NULL
          OR source_state.paused_at IS NOT NULL
        ))
        OR (source.source_kind = 'admin_grant' AND (
          membership.cancelled_at IS NOT NULL OR membership.expired_at IS NOT NULL
        ))
      )
    FOR UPDATE OF membership`)
  return rows[0] as CurrentMembership | undefined
}

async function getHighestPriorityFallbackSource(
  userId: string,
  currentSourceId: string,
  query: QueryExecutor,
  membershipSourceId?: string,
): Promise<ValidFallbackSource | undefined> {
  const { rows } = await query(sql`/* restoreFallbackAfterCurrentAccessEnds: sources */
    SELECT source.id AS membership_source_id, source_state.membership_product_id,
      source.source_kind, source_state.auto_renews, source_state.effective_at,
      source_state.expires_at, source_state.past_due_at, product.plan,
      grant_row.created_at AS grant_created_at, activation.id IS NOT NULL AS has_open_grant_activation
    FROM membership_sources source
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
    INNER JOIN membership_products product ON product.id = source_state.membership_product_id
    LEFT JOIN membership_provider_observations observation
      ON observation.id = source_state.membership_provider_observation_id
    LEFT JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_id
    LEFT JOIN membership_grants grant_row ON grant_row.membership_source_id = source.id
    LEFT JOIN membership_grant_activation_periods activation
      ON activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
    WHERE source.user_id = ${userId} AND source.id <> ${currentSourceId}
      AND (${membershipSourceId ?? null}::uuid IS NULL OR source.id = ${membershipSourceId ?? null}::uuid)
      AND source_state.effective_at <= CURRENT_TIMESTAMP
      AND (
        (source.source_kind = 'direct'
          AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
          AND source_state.paused_at IS NULL
          AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL)
        OR (
          source.source_kind = 'family'
          AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
          AND source_state.past_due_at IS NULL AND source_state.paused_at IS NULL
          AND (source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
          AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
        )
        OR (
          source.source_kind = 'admin_grant'
          AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
          AND source_state.past_due_at IS NULL AND source_state.paused_at IS NULL
          AND (source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
          AND grant_row.revoked_at IS NULL
          AND membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond'
        )
      )
    FOR UPDATE OF source_state`)
  return selectHighestPriorityMembershipSource(
    retainOldestQueuedGrantPerPlan(rows as ValidFallbackSource[]),
  )
}
