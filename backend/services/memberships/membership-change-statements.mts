import sql from 'sql-template-strings'
import type { MembershipChangeType } from './types.mts'

export type MembershipChangeInput = {
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
}

export function buildMembershipChangesInsert(
  changes: readonly MembershipChangeInput[],
  ignoreDuplicateStripeEvent = false,
) {
  // The volatile UUID expression is evaluated once per input row and reused for result correlation.
  const statement = sql`/* recordMembershipChanges */
    WITH input AS (
      SELECT uuidv7() AS id, membership_id, user_id, source_id, grant_id, change_type,
        from_product_id, to_product_id, changed_by_id, note, stripe_event_id,
        provider_evidence_id, cancelled_at, expired_at, past_due_at, paused_at,
        should_cancel_at_period_end, position
      FROM unnest(
        ${changes.map(row => row.membershipId)}::uuid[],
        ${changes.map(row => row.userId)}::uuid[],
        ${changes.map(row => row.membershipSourceId ?? null)}::uuid[],
        ${changes.map(row => row.membershipGrantId ?? null)}::uuid[],
        ${changes.map(row => row.changeType)}::membership_change_types[],
        ${changes.map(row => row.fromSkuId ?? null)}::uuid[],
        ${changes.map(row => row.toSkuId ?? null)}::uuid[],
        ${changes.map(row => row.changedById ?? null)}::uuid[],
        ${changes.map(row => row.note ?? null)}::text[],
        ${changes.map(row => row.stripeEventId ?? null)}::text[],
        ${changes.map(row => row.membershipProviderEvidenceId ?? null)}::uuid[],
        ${changes.map(row => row.cancelledAt ?? null)}::timestamptz[],
        ${changes.map(row => row.expiredAt ?? null)}::timestamptz[],
        ${changes.map(row => row.pastDueAt ?? null)}::timestamptz[],
        ${changes.map(row => row.pausedAt ?? null)}::timestamptz[],
        ${changes.map(row => row.cancelAtPeriodEnd ?? false)}::boolean[]
      ) WITH ORDINALITY AS input(
        membership_id, user_id, source_id, grant_id, change_type,
        from_product_id, to_product_id, changed_by_id, note, stripe_event_id,
        provider_evidence_id, cancelled_at, expired_at, past_due_at, paused_at,
        should_cancel_at_period_end, position
      )
    ), inserted AS (
      INSERT INTO membership_changes (
        id, membership_id, user_id, membership_source_id, membership_grant_id, change_type,
        from_membership_product_id, to_membership_product_id, changed_by_id, note,
        stripe_event_id, membership_provider_evidence_record_id,
        cancelled_at, expired_at, past_due_at, paused_at, should_cancel_at_period_end
      )
      SELECT input.id, input.membership_id, input.user_id,
        COALESCE(
          input.source_id,
          (SELECT membership_source_id FROM memberships WHERE id = input.membership_id)
        ),
        COALESCE(
          input.grant_id,
          (
            SELECT membership_grant.id
            FROM memberships membership
            INNER JOIN membership_grants membership_grant
              ON membership_grant.membership_source_id = membership.membership_source_id
            WHERE membership.id = input.membership_id
          )
        ),
        input.change_type, input.from_product_id, input.to_product_id, input.changed_by_id,
        input.note, input.stripe_event_id, input.provider_evidence_id,
        input.cancelled_at, input.expired_at, input.past_due_at, input.paused_at,
        input.should_cancel_at_period_end
      FROM input
      ORDER BY input.position`
  if (ignoreDuplicateStripeEvent) {
    statement.append(
      sql` ON CONFLICT (stripe_event_id) WHERE stripe_event_id IS NOT NULL DO NOTHING`,
    )
  }
  statement.append(sql` RETURNING id, user_id, membership_id
    )
    SELECT inserted.id, inserted.user_id, inserted.membership_id, input.position::integer AS position
    FROM inserted
    INNER JOIN input ON input.id = inserted.id`)
  return statement
}

export function buildLatestMembershipChangeUpdate(
  insertedIds: readonly string[],
  insertedMembershipIds: readonly string[],
) {
  return sql`/* recordMembershipChanges:updateLatest */
    UPDATE memberships m
    SET latest_change_id = newest.id
    FROM (
      SELECT DISTINCT ON (membership_id) id, membership_id, created_at
      FROM membership_changes
      WHERE id = ANY(${insertedIds}::uuid[])
      ORDER BY membership_id, created_at DESC, id DESC
    ) newest
    WHERE m.id = ANY(${insertedMembershipIds}::uuid[])
      AND m.id = newest.membership_id
      AND (
        m.latest_change_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM membership_changes current_change
          WHERE current_change.id = m.latest_change_id
            AND (current_change.created_at, current_change.id) < (newest.created_at, newest.id)
        )
      )
  `
}
