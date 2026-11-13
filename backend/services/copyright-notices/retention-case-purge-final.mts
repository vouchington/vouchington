import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { hasBlockedCopyrightCaseParty } from './retention-case-purge-verify-parties.mts'
import { enterCopyrightCasePurgePhase } from './retention-case-purge-phase-state.mts'
import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Fixed replay anchors then root, with each table scoped in this transaction. */
export const COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER = [
  'copyright_notice_email_intake_notice_links',
  'copyright_notice_email_intakes',
  'copyright_notice_form_intakes',
  'copyright_territorial_notice_receipts',
  'copyright_notice_submissions',
  'copyright_territorial_decision_identities',
  'copyright_notices',
] as const
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
      set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER[0]}, true)`)
  const { rows: initialLinks } = await query<{
    copyright_notice_email_intake_id: string
  }>(sql`/* deleteCopyrightCaseFinalEmailLink */
    DELETE FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_id = ${noticeId}::uuid AND link_kind = 'initial'
    RETURNING copyright_notice_email_intake_id`)
  if (initialLinks[0]) {
    await query(sql`/* scopeCopyrightCaseFinalEmailIntake */
      SELECT set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER[1]}, true),
        set_config('app.copyright_operational_retention', 'on', true)`)
    await query(sql`/* deleteCopyrightCaseFinalEmailIntake */
      DELETE FROM copyright_notice_email_intakes
      WHERE id = ${initialLinks[0].copyright_notice_email_intake_id}::uuid`)
  }

  // ast-grep-ignore: no-three-sequential-awaits -- set each replay-anchor table permit before its guarded DELETE; finish each FK-ordered deletion before authorizing the next table
  await query(sql`/* scopeCopyrightCaseFinalFormIntake */
    SELECT set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER[2]}, true)`)
  await query(sql`/* deleteCopyrightCaseFinalFormIntake */
    DELETE FROM copyright_notice_form_intakes
    WHERE copyright_notice_id = ${noticeId}::uuid`)

  await query(sql`/* scopeCopyrightCaseFinalTerritorialReceipts */
    SELECT set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER[3]}, true)`)
  await query(sql`/* deleteCopyrightCaseFinalTerritorialReceipts */
    DELETE FROM copyright_territorial_notice_receipts
    WHERE copyright_notice_id = ${noticeId}::uuid`)

  await query(sql`/* scopeCopyrightCaseFinalSubmission */
    SELECT set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER[4]}, true)`)
  await query(sql`/* deleteCopyrightCaseFinalSubmission */
    DELETE FROM copyright_notice_submissions
    WHERE copyright_notice_id = ${noticeId}::uuid
      AND kind = 'notice' AND source_kind <> 'staff'`)

  // The final result remains on the case through every earlier page. Null the
  // current FK only inside the same transaction that removes its case root.
  // ast-grep-ignore: no-three-sequential-awaits -- set the notice permit before cutting current decision FK pointers; remove decision identities after that cut, then delete the notice root
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
    SELECT set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER[5]}, true)`)
  await query(sql`/* deleteCopyrightCaseFinalDecisionIdentity */
    DELETE FROM copyright_territorial_decision_identities
    WHERE copyright_notice_id = ${noticeId}::uuid`)

  await query(sql`/* scopeCopyrightCaseFinalNotice */
    SELECT set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER[6]}, true)`)
  await query(sql`/* deleteCopyrightCaseFinalNotice */
    DELETE FROM copyright_notices WHERE id = ${noticeId}::uuid`)
}

/** Complete the final live-owner page only after its current party preservation check. */
export async function runCopyrightCaseFinalPage(
  query: TransactionQuery,
  data: CopyrightCasePurgeJobData,
) {
  if (await hasBlockedCopyrightCaseParty(query, data.noticeId)) return { data, hasMore: false }
  await deleteCopyrightCaseFinalTail(query, data.noticeId)
  return { data: enterCopyrightCasePurgePhase(data, 'residual_parties'), hasMore: true }
}
