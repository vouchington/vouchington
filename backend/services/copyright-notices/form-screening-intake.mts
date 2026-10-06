import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Structured form fields the screening agent may see. Contact, email, and signature values never enter it. */
export type CopyrightFormIntakeForScreening = {
  intakeId: string
  sourceKind: 'signed_in_form' | 'guest_form'
  jurisdiction: string
  statutoryFieldsComplete: boolean
  claimantDisplayName: string | null
  workDescription: string
  hostedUseUrls: string[]
  hasClaimantContact: boolean
  hasClaimantEmail: boolean
  hasElectronicSignature: boolean
  goodFaithBelief: boolean
  accuracyAuthorityUnderPenaltyOfPerjury: boolean
}

/** @public Cross-workspace read boundary used by the copyright form-screening agent. */
export async function getCopyrightFormIntakeForScreening(
  submissionId: string,
): Promise<CopyrightFormIntakeForScreening | null> {
  const { rows } = await write<{
    id: string
    source_kind: 'signed_in_form' | 'guest_form'
    work_description: string
    jurisdiction: string
    claimant_display_name: string | null
    hosted_use_urls: string[]
    has_claimant_contact: boolean
    has_claimant_email: boolean
    has_hosted_target: boolean
    has_good_faith_belief: boolean
    has_accuracy_authority_under_penalty_of_perjury: boolean
    has_electronic_signature: boolean
  }>(sql`/* getCopyrightFormIntakeForScreening */
    SELECT intake.id, submission.source_kind, notice.work_description, notice.jurisdiction,
      notice.claimant_display_name,
      ARRAY(
        SELECT target.hosted_use_url FROM copyright_notice_targets target
        -- Current intake contract permits at most 20 claimant targets (form-input-validation.mts).
        WHERE target.copyright_notice_id = notice.id ORDER BY target.id LIMIT 20
      ) AS hosted_use_urls,
      char_length(notice.claimant_contact_ciphertext) > 0 AS has_claimant_contact,
      EXISTS (
        SELECT 1
        FROM copyright_notice_delivery_work_items receipt
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
        -- Current intake contract permits at most 20 claimant targets (form-input-validation.mts).
        WHERE target.copyright_notice_id = notice.id
          AND char_length(btrim(target.hosted_use_url)) > 0
      ) AS has_hosted_target,
      intake.has_good_faith_belief, intake.has_accuracy_authority_under_penalty_of_perjury,
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
    jurisdiction: row.jurisdiction,
    statutoryFieldsComplete:
      row.jurisdiction === 'us_dmca' &&
      row.has_claimant_contact &&
      row.has_claimant_email &&
      row.has_hosted_target &&
      row.work_description.trim().length > 0 &&
      row.has_good_faith_belief &&
      row.has_accuracy_authority_under_penalty_of_perjury &&
      row.has_electronic_signature,
    claimantDisplayName: row.claimant_display_name,
    workDescription: row.work_description,
    hostedUseUrls: row.hosted_use_urls,
    hasClaimantContact: row.has_claimant_contact,
    hasClaimantEmail: row.has_claimant_email,
    hasElectronicSignature: row.has_electronic_signature,
    goodFaithBelief: row.has_good_faith_belief,
    accuracyAuthorityUnderPenaltyOfPerjury: row.has_accuracy_authority_under_penalty_of_perjury,
  }
}
