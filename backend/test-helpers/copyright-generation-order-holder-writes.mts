import type { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

type Holder = Awaited<ReturnType<typeof beginTransaction>>

/** Row locks an email rejection writer takes after owning the generation. */
export async function lockRejectionRowsAsHolder(holder: Holder, intakeId: string): Promise<void> {
  await holder(sql`/* testGenerationOrder:rejectionRows */
    SELECT notice.id FROM copyright_notices notice
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_id = notice.id
    JOIN copyright_notice_email_intakes intake
      ON intake.id = link.copyright_notice_email_intake_id
    WHERE intake.id = ${intakeId} FOR UPDATE OF notice, link, intake`)
}

/** Row locks an assessment writer takes after owning the generation. */
export async function lockAssessmentRowsAsHolder(
  holder: Holder,
  submissionId: string,
): Promise<void> {
  await holder(sql`/* testGenerationOrder:assessmentRows */
    SELECT submission.id FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${submissionId} FOR UPDATE OF notice, submission`)
}

/** The notice lock a delivery batch must not have key-shared before its generation. */
export async function lockNoticeRowAsHolder(holder: Holder, noticeId: string): Promise<void> {
  await holder(sql`/* testGenerationOrder:batchRows */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
}
