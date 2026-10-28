import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Fence the case before locking capability rows or changing its retained activity clock. */
export async function lockCopyrightGuestCapabilityCases(
  transaction: TransactionQuery,
  ids: readonly string[],
): Promise<void> {
  await transaction(sql`/* lockCopyrightGuestRetentionCases */
    SELECT notice.id FROM copyright_notices notice
    JOIN copyright_notice_guest_capabilities capability
      ON capability.copyright_notice_id = notice.id
    WHERE capability.id = ANY(${[...ids]}::uuid[])
    ORDER BY notice.id FOR KEY SHARE OF notice`)
}

/** The original expiry clock survives removal of unused live authentication material. */
export async function deleteExpiredCopyrightGuestCapabilities(
  transaction: TransactionQuery,
  ids: readonly string[],
  cutoff: Date,
): Promise<number> {
  const { rows } = await transaction<{ deleted_count: number }>(sql`
    /* deleteExpiredCopyrightGuestCapabilities */
    WITH deleted AS (
      DELETE FROM copyright_notice_guest_capabilities capability
      WHERE capability.id = ANY(${[...ids]}::uuid[])
        AND capability.expires_at <= ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_submissions submission
          WHERE submission.copyright_notice_guest_capability_id = capability.id)
      RETURNING copyright_notice_id, updated_at, expires_at, revoked_at
    ), retained_clock AS (
      INSERT INTO copyright_notice_thread_retention_activity
        (copyright_notice_id, last_activity_at)
      SELECT copyright_notice_id,
        MAX(GREATEST(updated_at,
          CASE WHEN revoked_at IS NULL THEN expires_at ELSE updated_at END))
      FROM deleted GROUP BY copyright_notice_id ORDER BY copyright_notice_id
      ON CONFLICT (copyright_notice_id) DO UPDATE
        SET last_activity_at = GREATEST(
          copyright_notice_thread_retention_activity.last_activity_at,
          EXCLUDED.last_activity_at)
      RETURNING copyright_notice_id
    )
    SELECT COUNT(*)::int AS deleted_count FROM deleted`)
  return rows[0]!.deleted_count
}
