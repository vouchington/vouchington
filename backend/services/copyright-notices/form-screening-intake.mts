import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** @public Cross-workspace read boundary used by the copyright form-screening agent. */
export async function getCopyrightFormIntakeForScreening(submissionId: string): Promise<{
  intakeId: string
  sourceKind: 'signed_in_form' | 'guest_form'
  statutoryFieldsComplete: boolean
  workDescription: string
} | null> {
  const { rows } = await write<{
    id: string
    source_kind: 'signed_in_form' | 'guest_form'
    work_description: string
    jurisdiction: string
    has_claimant_contact: boolean
    has_claimant_email: boolean
    has_hosted_target: boolean
    good_faith_belief: boolean
    accuracy_authority_under_penalty_of_perjury: boolean
    has_electronic_signature: boolean
  }>(sql`/* getCopyrightFormIntakeForScreening */
    SELECT intake.id, submission.source_kind, notice.work_description, notice.jurisdiction,
      char_length(notice.claimant_contact_ciphertext) > 0 AS has_claimant_contact,
      EXISTS (
        SELECT 1
        FROM copyright_notice_delivery_intents receipt
        JOIN copyright_notice_delivery_recipients recipient
          ON recipient.copyright_notice_delivery_intent_id = receipt.id
        WHERE receipt.copyright_notice_id = notice.id
          AND receipt.recipient_role = 'claimant' AND receipt.channel = 'email'
          AND receipt.delivery_kind = 'claimant_receipt'
      ) AS has_claimant_email,
      EXISTS (
        SELECT 1
        FROM copyright_notice_targets target
        JOIN copyright_notice_target_images target_image
          ON target_image.copyright_notice_target_id = target.id
        WHERE target.copyright_notice_id = notice.id
          AND char_length(btrim(target.hosted_use_url)) > 0
      ) AS has_hosted_target,
      intake.good_faith_belief, intake.accuracy_authority_under_penalty_of_perjury,
      char_length(intake.electronic_signature_ciphertext) > 0 AS has_electronic_signature
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    WHERE intake.copyright_notice_submission_id = ${submissionId}
  `)
  const row = rows[0]
  if (!row) return null
  return {
    intakeId: row.id,
    sourceKind: row.source_kind,
    statutoryFieldsComplete:
      row.jurisdiction === 'us_dmca' &&
      row.has_claimant_contact &&
      row.has_claimant_email &&
      row.has_hosted_target &&
      row.work_description.trim().length > 0 &&
      row.good_faith_belief &&
      row.accuracy_authority_under_penalty_of_perjury &&
      row.has_electronic_signature,
    workDescription: row.work_description,
  }
}
