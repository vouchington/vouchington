import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Count only the two late agent outputs asserted by the owning fence tests. */
export async function countTestCopyrightEmailRecommendations(noticeId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    /* countTestCopyrightEmailRecommendations */
    SELECT count(*)::integer AS count
    FROM copyright_notice_email_intake_recommendations recommendation
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = recommendation.copyright_notice_email_intake_receipt_id
    WHERE link.copyright_notice_id = ${noticeId}::uuid`)
  return rows[0]?.count ?? 0
}

export async function countTestCopyrightFormScreenings(noticeId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    /* countTestCopyrightFormScreenings */
    SELECT count(*)::integer AS count
    FROM copyright_notice_form_screenings screening
    JOIN copyright_notice_form_intakes intake
      ON intake.id = screening.copyright_notice_form_intake_id
    WHERE intake.copyright_notice_id = ${noticeId}::uuid`)
  return rows[0]?.count ?? 0
}
