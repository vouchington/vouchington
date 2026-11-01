import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * The admission anchors are unique by case and kind, and territorial receipts
 * are unique by case and the two territorial jurisdictions. They stay intact
 * until this transaction so an initial request still replays its original result.
 */
export async function deleteCopyrightCaseFinalTail(
  query: TransactionQuery,
  noticeId: string,
): Promise<void> {
  await query(sql`/* scopeCopyrightCaseFinalEmailLink */
    SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_case_purge_table', 'copyright_notice_email_intake_notice_links', true)`)
  const { rows: initialLinks } = await query<{
    copyright_notice_email_intake_id: string
  }>(sql`/* deleteCopyrightCaseFinalEmailLink */
    DELETE FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_id = ${noticeId}::uuid AND link_kind = 'initial'
    RETURNING copyright_notice_email_intake_id`)
  if (initialLinks[0]) {
    await query(sql`/* scopeCopyrightCaseFinalEmailIntake */
      SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_email_intakes', true)`)
    await query(sql`/* deleteCopyrightCaseFinalEmailIntake */
      DELETE FROM copyright_notice_email_intakes
      WHERE id = ${initialLinks[0].copyright_notice_email_intake_id}::uuid`)
  }

  await query(sql`/* scopeCopyrightCaseFinalFormIntake */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_form_intakes', true)`)
  await query(sql`/* deleteCopyrightCaseFinalFormIntake */
    DELETE FROM copyright_notice_form_intakes
    WHERE copyright_notice_id = ${noticeId}::uuid`)

  await query(sql`/* scopeCopyrightCaseFinalTerritorialReceipts */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_territorial_notice_receipts', true)`)
  await query(sql`/* deleteCopyrightCaseFinalTerritorialReceipts */
    DELETE FROM copyright_territorial_notice_receipts
    WHERE copyright_notice_id = ${noticeId}::uuid`)

  await query(sql`/* scopeCopyrightCaseFinalSubmission */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true)`)
  await query(sql`/* deleteCopyrightCaseFinalSubmission */
    DELETE FROM copyright_notice_submissions
    WHERE copyright_notice_id = ${noticeId}::uuid
      AND kind = 'notice' AND source_kind <> 'staff'`)

  // The final result remains on the case through every earlier page. Null the
  // current FK only inside the same transaction that removes its case root.
  await query(sql`/* scopeCopyrightCaseFinalNoticePointer */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_notices', true)`)
  await query(sql`/* cutCopyrightCaseFinalNoticePointer */
    UPDATE copyright_notices SET
      current_territorial_decision_identity_id = NULL,
      territorial_authorizing_assessment_identity_id = NULL,
      territorial_decision_outcome = NULL,
      territorial_decided_at = NULL,
      territorial_decided_by_id = NULL,
      territorial_rationale_ciphertext = NULL,
      territorial_public_explanation_ciphertext = NULL
    WHERE id = ${noticeId}::uuid`)

  await query(sql`/* scopeCopyrightCaseFinalDecisionIdentity */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_territorial_decision_identities', true)`)
  await query(sql`/* deleteCopyrightCaseFinalDecisionIdentity */
    DELETE FROM copyright_territorial_decision_identities
    WHERE copyright_notice_id = ${noticeId}::uuid`)

  await query(sql`/* scopeCopyrightCaseFinalNotice */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_notices', true)`)
  await query(sql`/* deleteCopyrightCaseFinalNotice */
    DELETE FROM copyright_notices WHERE id = ${noticeId}::uuid`)
}
