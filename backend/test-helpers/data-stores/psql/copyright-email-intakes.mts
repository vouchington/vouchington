import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readCopyrightEmailIntakeReview(intakeId: string): Promise<
  {
    accepted: boolean
    promoted_copyright_notice_id: string | null
  }[]
> {
  const { rows } = await read<{
    accepted: boolean
    promoted_copyright_notice_id: string | null
  }>(sql`/* readCopyrightEmailIntakeReview */
    SELECT accepted, promoted_copyright_notice_id
    FROM copyright_notice_email_intake_reviews
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  return rows
}

export async function readCopyrightEmailIntakeResponses(intakeId: string): Promise<
  {
    id: string
    response_kind: 'rejected' | 'needs_information'
    state: string
  }[]
> {
  const { rows } = await read<{
    id: string
    response_kind: 'rejected' | 'needs_information'
    state: string
  }>(sql`/* readCopyrightEmailIntakeResponses */
    SELECT id, response_kind, state
    FROM copyright_notice_email_intake_responses
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  return rows
}
