import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { COPYRIGHT_PRESERVATION_PARTIES_SQL } from '../copyright-preservation-parties.mts'

/** A case-scoped legal hold probe against exactly one validated history child. */
export function copyrightHistoryHoldProbe(table: string, partitionName: string): string {
  const partition = assertSafeSqlIdentifier(partitionName)
  if (table === 'copyright_repeat_infringer_reviews') {
    return `EXISTS (
      SELECT 1 FROM user_legal_preservation_holds hold
      JOIN ${partition} candidate_row ON candidate_row.account_user_id = hold.account_user_id
      WHERE hold.released_at IS NULL LIMIT 1)`
  }

  // The same held claimant, submitter, incident account, and placement parties as case erasure.
  // This constant is parameter-free; all input identifiers are validated above.
  if (COPYRIGHT_PRESERVATION_PARTIES_SQL.values.length !== 0) {
    throw new Error('Copyright preservation party SQL must be parameter-free')
  }
  const heldCases = `(${COPYRIGHT_PRESERVATION_PARTIES_SQL.text}) preserved`
  const joins: Record<string, readonly string[]> = {
    copyright_notice_lifecycle_changes: [
      `JOIN ${partition} candidate_row ON candidate_row.copyright_notice_id = preserved.notice_id`,
      `JOIN copyright_notice_email_intake_notice_links link ON link.copyright_notice_id = preserved.notice_id
       JOIN ${partition} candidate_row ON candidate_row.copyright_notice_email_intake_id = link.copyright_notice_email_intake_receipt_id`,
    ],
    copyright_territorial_decisions: [
      `JOIN ${partition} candidate_row ON candidate_row.copyright_notice_id = preserved.notice_id`,
    ],
    copyright_territorial_redress_decisions: [
      `JOIN copyright_territorial_redress_requests request ON request.copyright_notice_id = preserved.notice_id
       JOIN ${partition} candidate_row ON candidate_row.copyright_territorial_redress_request_id = request.id`,
    ],
    copyright_notice_submission_assessments: [
      `JOIN copyright_notice_submissions submission ON submission.copyright_notice_id = preserved.notice_id
       JOIN ${partition} candidate_row ON candidate_row.copyright_notice_submission_id = submission.id`,
    ],
    copyright_notice_email_intake_recommendations: [
      `JOIN copyright_notice_email_intake_notice_links link ON link.copyright_notice_id = preserved.notice_id
       JOIN ${partition} candidate_row ON candidate_row.copyright_notice_email_intake_receipt_id = link.copyright_notice_email_intake_receipt_id`,
    ],
    copyright_notice_email_intake_reviews: [
      `JOIN copyright_notice_email_intake_notice_links link ON link.copyright_notice_id = preserved.notice_id
       JOIN ${partition} candidate_row ON candidate_row.copyright_notice_email_intake_receipt_id = link.copyright_notice_email_intake_receipt_id`,
      `JOIN ${partition} candidate_row ON candidate_row.promoted_copyright_notice_id = preserved.notice_id`,
    ],
    copyright_notice_email_correspondence_reviews: [
      `JOIN ${partition} candidate_row ON candidate_row.copyright_notice_id = preserved.notice_id`,
    ],
    copyright_restriction_administrator_lifts: [
      `JOIN copyright_notice_targets target ON target.copyright_notice_id = preserved.notice_id
       JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
       JOIN ${partition} candidate_row ON candidate_row.copyright_restriction_id = restriction.id`,
    ],
    copyright_repeat_infringer_dispositions: [
      `JOIN copyright_repeat_infringer_incidents incident ON incident.copyright_notice_id = preserved.notice_id
       JOIN ${partition} candidate_row ON candidate_row.copyright_repeat_infringer_incident_id = incident.id`,
    ],
  }
  const branches = joins[table]
  if (!branches) throw new Error(`No copyright history preservation scope for ${table}`)
  return branches
    .map(
      join => `EXISTS (
    SELECT 1 FROM ${heldCases} ${join}
    WHERE preserved.released_at IS NULL LIMIT 1)`,
    )
    .join(' OR ')
}
