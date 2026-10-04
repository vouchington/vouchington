import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from './placement-parties.mts'

/**
 * The body of a `preservation(notice_id, released_at)` CTE: one row per legal-process preservation
 * hold (open, or released at `released_at`) on an account that is a party to a case. A party is the
 * signed-in claimant, the account that submitted any submission of the case, the account of a
 * repeat-infringer incident raised on it, or the author of a post a target placement belongs to.
 * The last arm is the join `assertCopyrightEvidenceAllowsDeletion` uses for account deletion, so
 * the sweep and account deletion agree on whose records a hold covers.
 *
 * Each arm starts from the holds, which are few, and reaches the case through an indexed account
 * column. Holds are never deleted, so a released hold still marks when the case last stopped being
 * preserved: the retention clock waits from that time.
 */
export const COPYRIGHT_PRESERVATION_PARTIES_SQL = sql`
      SELECT notice.id AS notice_id, hold.released_at
      FROM user_legal_preservation_holds hold
      JOIN copyright_notices notice ON notice.claimant_user_id = hold.account_user_id
      UNION ALL
      SELECT submission.copyright_notice_id, hold.released_at
      FROM user_legal_preservation_holds hold
      JOIN copyright_notice_submissions submission
        ON submission.submitted_by_user_id = hold.account_user_id
      UNION ALL
      SELECT incident.copyright_notice_id, hold.released_at
      FROM user_legal_preservation_holds hold
      JOIN copyright_repeat_infringer_incidents incident
        ON incident.account_user_id = hold.account_user_id
      UNION ALL
      SELECT target.copyright_notice_id, hold.released_at
      FROM copyright_notice_targets target
      CROSS JOIN LATERAL `.append(copyrightPlacementPartiesSql('retain')).append(sql` party
      JOIN user_legal_preservation_holds hold ON hold.account_user_id = party.user_id
    `)

/**
 * Takes, in id order, the per-account advisory lock that placing a preservation hold and deleting
 * an account also take, for every account that is a party to the case (the same four relations as
 * above). A placement already in flight therefore commits before the eligibility recheck reads
 * holds, and one that starts later waits until the erasure commits, so a hold is never placed
 * between the recheck and the irreversible bucket deletion.
 */
async function lockCopyrightRetentionPartyAccounts(
  transaction: TransactionQuery,
  noticeId: string,
): Promise<void> {
  const statement = sql`/* listCopyrightRetentionParties */
    SELECT DISTINCT party.user_id FROM (
      SELECT claimant_user_id AS user_id FROM copyright_notices WHERE id = ${noticeId}
      UNION ALL
      SELECT submitted_by_user_id FROM copyright_notice_submissions
      WHERE copyright_notice_id = ${noticeId}
      UNION ALL
      SELECT account_user_id FROM copyright_repeat_infringer_incidents
      WHERE copyright_notice_id = ${noticeId}
      UNION ALL
      SELECT party.user_id
      FROM copyright_notice_targets target
      CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('retain'))
  statement.append(sql` party
      WHERE target.copyright_notice_id = ${noticeId}
    ) party
    WHERE party.user_id IS NOT NULL
    ORDER BY party.user_id`)
  const { rows } = await transaction<{ user_id: string }>(statement)
  for (const { user_id: userId } of rows) {
    // oxlint-disable-next-line no-await-in-loop -- locks must be taken one at a time in id order.
    await transaction(sql`/* lockCopyrightRetentionParty */
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)
  }
}

/**
 * Locks what an erasure must hold from the eligibility recheck until it commits: the party
 * accounts first (see above), then the notice row, so a concurrent child insert waits. The
 * account-then-case-rows order is the one account deletion uses.
 */
export async function lockCopyrightRetentionCase(
  transaction: TransactionQuery,
  noticeId: string,
): Promise<void> {
  await lockCopyrightRetentionPartyAccounts(transaction, noticeId)
  await transaction(sql`/* lockCopyrightRetentionNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
}
