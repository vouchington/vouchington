import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import { countCopyrightActiveRestrictionsForNotice } from '../../data-stores/psql/copyright-notice-reads.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'

/** Why automatic withholding refused a submission, or null when no gate refused it. */
export async function readTestAutomaticWithholdingRefusal(
  submissionId: string,
): Promise<string | null> {
  const { rows } = await write<{ reason: string }>(sql`/* readTestAutomaticWithholdingRefusal */
    SELECT reason FROM copyright_automatic_withholding_refusals
    WHERE copyright_notice_submission_id = ${submissionId}
  `)
  return rows[0]?.reason ?? null
}

/** What automatic withholding did to a notice: its refusal, assessment count and live restrictions. */
export async function readTestAutomaticWithholdingOutcome(notice: {
  intake: { copyright_notice_id: string; copyright_notice_submission_id: string }
}): Promise<{ refusal: string | null; assessments: number; restrictions: number }> {
  const noticeId = notice.intake.copyright_notice_id
  const [refusal, aggregate, restrictions] = await Promise.all([
    readTestAutomaticWithholdingRefusal(notice.intake.copyright_notice_submission_id),
    getCopyrightNoticePrivateAggregate(noticeId),
    countCopyrightActiveRestrictionsForNotice(noticeId),
  ])
  return { refusal, assessments: aggregate?.assessments.length ?? 0, restrictions }
}

/** Whether a restriction was reversed on its claimant's suspension, and how many restores it owes. */
export async function readTestClaimantSuspensionReversal(
  restrictionId: string,
): Promise<{ recorded: boolean; restoreIntents: number }> {
  const { rows } = await write<{ recorded: boolean; restore_intents: number }>(sql`
    /* readTestClaimantSuspensionReversal */
    SELECT EXISTS (
      SELECT 1 FROM copyright_claimant_suspension_reversals WHERE copyright_restriction_id = ${restrictionId}
    ) AS recorded, (
      SELECT count(*)::int FROM copyright_notice_action_work_items
      WHERE copyright_restriction_id = ${restrictionId} AND action = 'restore'
    ) AS restore_intents
  `)
  return { recorded: rows[0]!.recorded, restoreIntents: rows[0]!.restore_intents }
}
