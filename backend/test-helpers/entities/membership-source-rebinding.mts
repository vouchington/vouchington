import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function releaseMembershipSourceForRebindForTest(
  membershipSourceId: string,
  releasedAt?: Date | string,
): Promise<{ boundAt: Date; releasedAt: Date }> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* releaseMembershipSourceForRebindForTest:projection */
    DELETE FROM memberships WHERE membership_source_id = ${membershipSourceId}`)
  const { rows } = await transaction(sql`/* releaseMembershipSourceForRebindForTest:binding */
    UPDATE membership_lineage_bindings binding
    SET released_at = COALESCE(${releasedAt ?? null}::timestamptz, CURRENT_TIMESTAMP),
        release_reason = 'account_hard_deleted'
    FROM membership_sources source
    WHERE source.id = ${membershipSourceId}
      AND binding.membership_provider_lineage_id = source.membership_provider_lineage_id
      AND binding.released_at IS NULL
    RETURNING binding.bound_at, binding.released_at`)
  await transaction(sql`/* releaseMembershipSourceForRebindForTest:source */
    UPDATE membership_sources SET user_id = NULL WHERE id = ${membershipSourceId}`)
  const binding = rows[0] as { bound_at: Date; released_at: Date }
  await transaction.commit()
  return { boundAt: binding.bound_at, releasedAt: binding.released_at }
}

export async function createMembershipBindingForRebindForTest(
  membershipSourceId: string,
  userId: string,
  boundAt: Date,
): Promise<void> {
  await write(sql`/* createMembershipBindingForRebindForTest */
    INSERT INTO membership_lineage_bindings (
      membership_provider_lineage_id, user_id, bound_at
    )
    SELECT source.membership_provider_lineage_id, ${userId}, ${boundAt}
    FROM membership_sources source
    WHERE source.id = ${membershipSourceId}
      AND source.membership_provider_lineage_id IS NOT NULL`)
}

export async function deleteTestMembershipProjectionForRefundSource(
  sourceId: string,
): Promise<void> {
  await write(sql`/* deleteTestMembershipProjectionForRefundSource */
    DELETE FROM memberships WHERE membership_source_id = ${sourceId}`)
}

export async function insertTestRefundSourceBoundaryChange(options: {
  sourceId: string
  userId: string
  at: Date
}): Promise<{ targetId: string; membershipId: string }> {
  const { rows } = await write<{ targetId: string; membershipId: string }>(sql`
    /* insertTestRefundSourceBoundaryChange */
    WITH identity AS (
      INSERT INTO retained_membership_identities (id) VALUES (uuidv7()) RETURNING id
    )
    INSERT INTO membership_changes (id, membership_id, user_id, membership_source_id, change_type)
    SELECT ${uuidv7({ msecs: options.at.getTime() })}, identity.id, ${options.userId},
      ${options.sourceId}, 'source_observed' FROM identity
    RETURNING id AS "targetId", membership_id AS "membershipId"`)
  return rows[0]!
}
