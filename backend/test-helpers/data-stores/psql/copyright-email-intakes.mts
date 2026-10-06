import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readCopyrightEmailIntakeReview(intakeId: string): Promise<
  {
    decision: string
    promoted_copyright_notice_id: string | null
  }[]
> {
  const { rows } = await read<{
    decision: string
    promoted_copyright_notice_id: string | null
  }>(sql`/* readCopyrightEmailIntakeReview */
    SELECT decision, promoted_copyright_notice_id
    FROM copyright_notice_email_intake_reviews
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  return rows
}

export async function readCopyrightEmailIntakeReviewRecord(intakeId: string): Promise<
  {
    decision: string
    reviewed_at: Date
    reviewed_by_id: string | null
    rationale_ciphertext: string
    recommendation_id: string | null
    promoted_copyright_notice_id: string | null
  }[]
> {
  const { rows } = await read<{
    decision: string
    reviewed_at: Date
    reviewed_by_id: string | null
    rationale_ciphertext: string
    recommendation_id: string | null
    promoted_copyright_notice_id: string | null
  }>(sql`/* readCopyrightEmailIntakeReviewRecord */
    SELECT decision, reviewed_at, reviewed_by_id, rationale_ciphertext,
      copyright_notice_email_intake_recommendation_id AS recommendation_id,
      promoted_copyright_notice_id
    FROM copyright_notice_email_intake_reviews
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  return rows
}

export async function readCopyrightEmailIntakeSesVerdicts(intakeId: string): Promise<{
  spf: string
  dkim: string
  dmarc: string
  spam: string
  virus: string
}> {
  const { rows } = await read<{
    spf: string
    dkim: string
    dmarc: string
    spam: string
    virus: string
  }>(sql`/* readCopyrightEmailIntakeSesVerdicts */
    SELECT spf_verdict AS spf, dkim_verdict AS dkim, dmarc_verdict AS dmarc,
      spam_verdict AS spam, virus_verdict AS virus
    FROM copyright_notice_email_intakes
    WHERE id = ${intakeId}`)
  const verdicts = rows[0]
  if (!verdicts) throw new Error(`Copyright email intake ${intakeId} was not found`)
  return verdicts
}

export async function readCopyrightEmailIntakeResponses(intakeId: string): Promise<
  {
    id: string
    delivery_kind:
      | 'email_intake_received'
      | 'email_intake_rejected'
      | 'email_intake_needs_information'
    state: string
  }[]
> {
  const { rows } = await read<{
    id: string
    delivery_kind:
      | 'email_intake_received'
      | 'email_intake_rejected'
      | 'email_intake_needs_information'
    state: string
  }>(sql`/* readCopyrightEmailIntakeResponses */
    SELECT id, delivery_kind, state
    FROM copyright_notice_delivery_intents
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  return rows
}

/** The cases an email intake is linked to; an approved initial intake links exactly one. */
export async function readCopyrightEmailIntakeNoticeLinks(
  intakeId: string,
): Promise<{ copyright_notice_id: string; link_kind: string }[]> {
  const { rows } = await read<{
    copyright_notice_id: string
    link_kind: string
  }>(sql`/* readCopyrightEmailIntakeNoticeLinks */
    SELECT copyright_notice_id, link_kind
    FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${intakeId}
    ORDER BY copyright_notice_id`)
  return rows
}
