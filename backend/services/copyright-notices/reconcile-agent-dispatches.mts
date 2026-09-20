import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CopyrightAgentDispatch =
  | { kind: 'email'; intakeId: string }
  | { kind: 'form'; submissionId: string }

/** Durable source-of-truth sweep for post-commit enqueue failures and exhausted queue retries. */
export async function getPendingCopyrightAgentDispatches(
  limit = 100,
): Promise<CopyrightAgentDispatch[]> {
  const { rows } = await read<{
    kind: 'email' | 'form'
    id: string
  }>(sql`/* getPendingCopyrightAgentDispatches */
    SELECT kind, id FROM (
      SELECT 'email'::text AS kind, intake.id
      FROM copyright_notice_email_intakes intake
      JOIN copyright_notice_email_intake_parses parse
        ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
      WHERE NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_recommendations recommendation
        WHERE recommendation.copyright_notice_email_intake_id = intake.id
      )
      UNION ALL
      SELECT 'form'::text AS kind, intake.copyright_notice_submission_id AS id
      FROM copyright_notice_form_intakes intake
      WHERE NOT EXISTS (
        SELECT 1 FROM copyright_notice_form_screenings screening
        WHERE screening.copyright_notice_form_intake_id = intake.id
      )
    ) candidates
    ORDER BY id
    LIMIT ${limit}
  `)
  return rows.map(row =>
    row.kind === 'email'
      ? { kind: 'email', intakeId: row.id }
      : { kind: 'form', submissionId: row.id },
  )
}
