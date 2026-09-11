import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getMembershipSourceIdByStripeSubscriptionId(
  subscriptionId: string,
  providerEnvironment: 'test' | 'production',
): Promise<string | null> {
  const { rows } = await read(sql`/* getMembershipSourceIdByStripeSubscriptionId */
    SELECT source.id
    FROM membership_sources source
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    WHERE lineage.provider = 'stripe'
      AND lineage.environment = ${providerEnvironment}
      AND lineage.application_id = 'voucha-web'
      AND lineage.provider_lineage_id = ${subscriptionId}
      AND source.source_kind = 'direct'
  `)
  const row = rows[0] as { id: string } | undefined
  return row?.id ?? null
}

export async function insertMembershipRefundIntentAtProviderReplayHorizonForTest(options: {
  membershipId: string
  membershipSourceId: string
  issuedById: string
  stripeIdempotencyKey: string
  requestFingerprint: string
}): Promise<void> {
  await write(sql`/* insertMembershipRefundIntentAtProviderReplayHorizonForTest */
    INSERT INTO membership_refund_intents (
      id, membership_id, membership_source_id, issued_by_id, stripe_idempotency_key,
      request_fingerprint
    ) VALUES (
      uuidv7(INTERVAL '-23 hours'), ${options.membershipId}, ${options.membershipSourceId},
      ${options.issuedById}, ${options.stripeIdempotencyKey}, ${options.requestFingerprint}
    )
  `)
}

export async function deleteTestMembershipAndCountRefundLedgerRows(
  membershipId: string,
): Promise<{ intentCount: number; refundCount: number }> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* deleteTestMembershipAndCountRefundLedgerRows:delete */
        DELETE FROM memberships WHERE id = ${membershipId}`)
    const { rows } = await query(sql`/* deleteTestMembershipAndCountRefundLedgerRows:count */
        SELECT
          (SELECT COUNT(*) FROM membership_refund_intents WHERE membership_id = ${membershipId}) AS intent_count,
          (SELECT COUNT(*) FROM membership_refunds WHERE membership_id = ${membershipId}) AS refund_count
      `)
    const counts = rows[0] as { intent_count: string; refund_count: string }
    const result = {
      intentCount: Number(counts.intent_count),
      refundCount: Number(counts.refund_count),
    }
    await transaction.commit()
    return result
  }
}

export async function releaseMembershipSourceForRebindForTest(
  membershipSourceId: string,
): Promise<{ boundAt: Date; releasedAt: Date }> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* releaseMembershipSourceForRebindForTest:projection */
        DELETE FROM memberships WHERE membership_source_id = ${membershipSourceId}`)
    const { rows } = await query(sql`/* releaseMembershipSourceForRebindForTest:binding */
        UPDATE membership_lineage_bindings binding
        SET released_at = date_trunc('milliseconds', CURRENT_TIMESTAMP),
          release_reason = 'account_hard_deleted'
        FROM membership_sources source
        WHERE source.id = ${membershipSourceId}
          AND binding.membership_provider_lineage_id = source.membership_provider_lineage_id
          AND binding.source_kind = source.source_kind
          AND binding.user_id = source.user_id
          AND binding.released_at IS NULL
        RETURNING binding.bound_at, binding.released_at`)
    await query(sql`/* releaseMembershipSourceForRebindForTest:source */
        UPDATE membership_sources SET user_id = NULL WHERE id = ${membershipSourceId}`)
    const binding = rows[0] as { bound_at: Date; released_at: Date }
    const result = { boundAt: binding.bound_at, releasedAt: binding.released_at }
    await transaction.commit()
    return result
  }
}

export async function createMembershipBindingForRebindForTest(
  membershipSourceId: string,
  userId: string,
  boundAt: Date,
): Promise<void> {
  await write(sql`/* createMembershipBindingForRebindForTest */
    INSERT INTO membership_lineage_bindings (
      membership_provider_lineage_id, user_id, source_kind, bound_at
    )
    SELECT source.membership_provider_lineage_id, ${userId}, source.source_kind, ${boundAt}
    FROM membership_sources source
    WHERE source.id = ${membershipSourceId}
      AND source.membership_provider_lineage_id IS NOT NULL`)
}
