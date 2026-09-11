import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function updateTestMembershipExpiresAt(
  membershipId: string,
  expiresAt: Date,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* updateTestMembershipExpiresAt */
        UPDATE memberships
        SET effective_at = LEAST(effective_at, ${expiresAt}), expires_at = ${expiresAt}
        WHERE id = ${membershipId}
      `)
    await query(sql`/* updateTestMembershipExpiresAt: mirror source state */
        UPDATE membership_source_states state
        SET effective_at = LEAST(state.effective_at, ${expiresAt}), expires_at = ${expiresAt},
            updated_at = CURRENT_TIMESTAMP
        FROM memberships membership
        WHERE membership.id = ${membershipId}
          AND state.membership_source_id = membership.membership_source_id
      `)
    await query(sql`/* updateTestMembershipExpiresAt: close backdated grant activation */
        UPDATE membership_grant_activation_periods activation
        SET ended_at = activation.started_at
        FROM memberships membership
        INNER JOIN membership_grants grant_row
          ON grant_row.membership_source_id = membership.membership_source_id
        WHERE membership.id = ${membershipId}
          AND activation.membership_grant_id = grant_row.id
          AND activation.ended_at IS NULL
          AND ${expiresAt} < activation.started_at
      `)
    await transaction.commit()
  }
}

export async function ageTestMembershipRenewalPriceIncreaseClaim(
  membershipId: string,
): Promise<void> {
  await write(sql`/* ageTestMembershipRenewalPriceIncreaseClaim */
    UPDATE memberships
    SET renewal_price_increase_claimed_at = CURRENT_TIMESTAMP - INTERVAL '2 hours'
    WHERE id = ${membershipId}
  `)
}

export async function updateTestMembershipCancelAtPeriodEnd(
  membershipId: string,
  cancelAtPeriodEnd: boolean,
): Promise<void> {
  await write(sql`/* updateTestMembershipCancelAtPeriodEnd */
    UPDATE memberships
    SET cancel_at_period_end = ${cancelAtPeriodEnd}
    WHERE id = ${membershipId}
  `)
}

export async function setTestMembershipSourceStateUpdatedAt(
  membershipId: string,
  updatedAt: Date,
): Promise<void> {
  await write(sql`/* setTestMembershipSourceStateUpdatedAt */
    UPDATE membership_source_states source_state
    SET updated_at = ${updatedAt}
    FROM memberships membership
    WHERE membership.id = ${membershipId}
      AND source_state.membership_source_id = membership.membership_source_id
  `)
}

export async function rejectTestMembershipProviderEvidence(membershipId: string): Promise<void> {
  await write(sql`/* rejectTestMembershipProviderEvidence */
    UPDATE membership_provider_evidence_records evidence
    SET verified_at = NULL,
        rejected_at = CURRENT_TIMESTAMP,
        rejection_reason = 'test evidence rejected'
    FROM memberships membership
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = membership.membership_source_id
    INNER JOIN membership_provider_observations observation
      ON observation.id = source_state.membership_provider_observation_id
    WHERE membership.id = ${membershipId}
      AND evidence.id = observation.membership_provider_evidence_id
  `)
}
