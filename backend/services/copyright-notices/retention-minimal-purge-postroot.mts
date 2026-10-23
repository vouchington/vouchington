import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** The root is already gone; retain party relations until their own capped pages finish. */
export async function drainCopyrightMinimalPurgePostroot(
  transaction: TransactionQuery,
  noticeId: string,
  pageSize: number,
  rootPurgedAt: Date | null | undefined,
): Promise<'progress' | 'purged' | 'ineligible'> {
  if (!rootPurgedAt) return 'ineligible'
  await transaction(sql`/* scopeCopyrightMinimalPurgePartyDrain */
    SELECT set_config('app.copyright_minimal_purge_notice_id', ${noticeId}, true)`)
  const { rows: page } = await transaction<{ scanned: number; deleted: number }>(sql`
    /* drainCopyrightMinimalPurgeRetainedParties */
    WITH candidate AS MATERIALIZED (
      SELECT party.ctid FROM copyright_notice_retained_parties party
      WHERE party.copyright_notice_identity_id = ${noticeId} LIMIT ${pageSize + 1}
    ), selected AS MATERIALIZED (SELECT ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_retained_parties party USING selected
      WHERE party.ctid = selected.ctid AND party.copyright_notice_identity_id = ${noticeId} RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`)
  if (page[0]?.scanned) {
    if (page[0].deleted === 0 || page[0].deleted > pageSize)
      throw new Error('Copyright retained-party drain failed its page bound')
    return 'progress'
  }
  await transaction(sql`/* completeCopyrightMinimalPurgeWork */
    DELETE FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId} AND root_purged_at IS NOT NULL`)
  await transaction(sql`/* releaseCopyrightRetainedCaseIdentity */
    DELETE FROM copyright_notice_retained_identities identity
    WHERE identity.id = ${noticeId}
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
        WHERE review.promoted_copyright_notice_identity_id = identity.id)`)
  return 'purged'
}
