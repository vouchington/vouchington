import sql, { type SQLStatement } from 'sql-template-strings'
import { exclusiveCaseThreadTokenScopeSql } from './retention-erasure-thread-tokens.mts'

/**
 * How an erased column is overwritten. Every overwrite keeps the column valid for its CHECK
 * constraints and never collides with a real value:
 * - `redact`: ciphertext becomes the literal `erased`; a NULL stays NULL so row-shape checks hold.
 * - `null`: a user id reference is dropped.
 * - `hex64`: a 64-character lookup token becomes a per-row digest, NULL stays NULL.
 * - `digest`: a 32-byte identity digest becomes a per-row digest.
 */
export type CopyrightRetentionErasureKind = 'redact' | 'null' | 'hex64' | 'digest'

export type CopyrightRetentionErasureTable = {
  table: string
  columns: Record<string, CopyrightRetentionErasureKind>
  /** The rows of the table that belong to one notice. */
  scope: (noticeId: string) => SQLStatement
}

/** Prefix exposed for an intake whose storage-object reference was erased. */
export const COPYRIGHT_ERASED_KEY_PREFIX = 'erased:'

const own = (id: string) => sql`copyright_notice_id = ${id}`
const viaSubmissions = (id: string) =>
  sql`copyright_notice_submission_id IN
    (SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${id})`
const viaRestrictions = (id: string) =>
  sql`copyright_restriction_id IN (SELECT restriction.id FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${id})`
const viaFormIntakes = (id: string) =>
  sql`copyright_notice_form_intake_id IN
    (SELECT id FROM copyright_notice_form_intakes WHERE copyright_notice_id = ${id})`
const emailIntakesOf = (id: string) =>
  sql`(SELECT copyright_notice_email_intake_id FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_id = ${id})`
const viaEmailIntakes = (id: string) =>
  sql`copyright_notice_email_intake_id IN `.append(emailIntakesOf(id))
const viaEmailReceipts = (id: string) =>
  sql`copyright_notice_email_intake_receipt_id IN `.append(emailIntakesOf(id))
const table = (
  name: string,
  columns: CopyrightRetentionErasureTable['columns'],
  scope: CopyrightRetentionErasureTable['scope'] = own,
): CopyrightRetentionErasureTable => ({ table: name, columns, scope })

/** Every table that holds claimant, poster, requester or reviewer text, and what is overwritten. */
export const COPYRIGHT_RETENTION_ERASURE: readonly CopyrightRetentionErasureTable[] = [
  table(
    'copyright_notices',
    {
      claimant_user_id: 'null',
      claimant_display_name: 'redact',
      claimant_contact_ciphertext: 'redact',
      work_description: 'redact',
      territorial_rationale_ciphertext: 'redact',
      territorial_public_explanation_ciphertext: 'redact',
    },
    id => sql`id = ${id}`,
  ),
  table(
    'copyright_notice_submissions',
    { submitted_by_id: 'null', body_ciphertext: 'redact' },
    own,
  ),
  table('copyright_notice_submission_requests', { requester_user_id: 'null' }, viaSubmissions),
  table('copyright_notice_submission_guidance', { guidance_ciphertext: 'redact' }, viaSubmissions),
  table('copyright_notice_form_intakes', {
    requester_user_id: 'null',
    requester_identity_sha256: 'digest',
    electronic_signature_ciphertext: 'redact',
  }),
  table(
    'copyright_notice_form_screenings',
    { rationale_ciphertext: 'redact', guidance_ciphertext: 'redact' },
    viaFormIntakes,
  ),
  table('copyright_notice_form_intake_reviews', { rationale_ciphertext: 'redact' }, viaFormIntakes),
  table('copyright_notice_evidence_artifacts', { storage_object_id: 'null' }, viaSubmissions),
  table(
    'copyright_notice_email_intake_receipts',
    { review_rationale_ciphertext: 'redact' },
    id =>
      sql`id IN (SELECT own_link.copyright_notice_email_intake_id
      FROM copyright_notice_email_intake_notice_links own_link
      WHERE own_link.copyright_notice_id = ${id}
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links other_link
          WHERE other_link.copyright_notice_email_intake_id = own_link.copyright_notice_email_intake_id
            AND other_link.copyright_notice_id <> ${id}
            AND NOT EXISTS (SELECT 1 FROM copyright_notices erased
              WHERE erased.id = other_link.copyright_notice_id AND erased.evidence_erased_at IS NULL)))`,
  ),
  table(
    'copyright_notice_email_intakes',
    { raw_storage_object_id: 'null', current_recommendation_output_ciphertext: 'redact' },
    id => sql`id IN `.append(emailIntakesOf(id)),
  ),
  table(
    'copyright_notice_email_intake_parses',
    {
      sender_email_ciphertext: 'redact',
      sender_name_ciphertext: 'redact',
      subject_ciphertext: 'redact',
      body_ciphertext: 'redact',
      message_id_ciphertext: 'redact',
      reply_references_ciphertext: 'redact',
      error_ciphertext: 'redact',
    },
    viaEmailIntakes,
  ),
  table(
    'copyright_notice_email_intake_attachments',
    { filename_ciphertext: 'redact', content_id_ciphertext: 'redact' },
    viaEmailIntakes,
  ),
  table(
    'copyright_notice_email_thread_tokens',
    { lookup_digest: 'hex64' },
    exclusiveCaseThreadTokenScopeSql,
  ),
  table('copyright_notice_email_thread_references', { token_id: 'null' }, viaEmailIntakes),
  table('copyright_notice_email_intake_notice_links', {
    matched_token_id: 'null',
    correspondence_rationale_ciphertext: 'redact',
    correspondence_manual_fallback_reason_ciphertext: 'redact',
  }),
  table(
    'copyright_notice_email_intake_recommendations',
    { structured_output_ciphertext: 'redact' },
    viaEmailReceipts,
  ),
  table(
    'copyright_notice_email_intake_reviews',
    { rationale_ciphertext: 'redact' },
    viaEmailReceipts,
  ),
  table('copyright_notice_email_correspondence_reviews', {
    rationale_ciphertext: 'redact',
    manual_fallback_reason_ciphertext: 'redact',
  }),
  table(
    'copyright_notice_appeal_recommendations',
    { rationale_ciphertext: 'redact' },
    viaSubmissions,
  ),
  table(
    'copyright_notice_appeal_reviews',
    { rationale_ciphertext: 'redact', manual_fallback_reason_ciphertext: 'redact' },
    viaSubmissions,
  ),
  table(
    'copyright_restriction_administrator_lifts',
    { rationale_ciphertext: 'redact' },
    viaRestrictions,
  ),
  table(
    'copyright_restrictions',
    { administrator_lift_rationale_ciphertext: 'redact' },
    id =>
      sql`copyright_notice_target_id IN (SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = ${id})`,
  ),
  table(
    'copyright_notice_counter_notice_reviews',
    { rationale_ciphertext: 'redact' },
    viaSubmissions,
  ),
  table(
    'copyright_notice_legal_hold_assessments',
    { rationale_ciphertext: 'redact' },
    viaSubmissions,
  ),
  table('copyright_notice_legal_hold_resolutions', { rationale_ciphertext: 'redact' }, id =>
    sql`copyright_notice_legal_hold_assessment_id IN (SELECT id FROM copyright_notice_legal_hold_assessments
        WHERE `
      .append(viaSubmissions(id))
      .append(')'),
  ),
  table('copyright_notice_correspondence_messages', { body_ciphertext: 'redact' }),
  table('copyright_notice_delivery_work_items', {
    body_ciphertext: 'redact',
    failure_ciphertext: 'redact',
  }),
  table(
    'copyright_notice_delivery_recipients',
    { email_ciphertext: 'redact' },
    id =>
      sql`copyright_notice_delivery_work_item_id IN (SELECT id FROM copyright_notice_delivery_work_items
        WHERE copyright_notice_id = ${id})`,
  ),
  table('copyright_notice_lifecycle_changes', { review_rationale_ciphertext: 'redact' }),
  table('copyright_decision_rationales', { rationale_ciphertext: 'redact' }, id =>
    sql`copyright_notice_id = ${id} OR copyright_notice_email_intake_receipt_id IN `.append(
      emailIntakesOf(id),
    ),
  ),
]
