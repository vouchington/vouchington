import sql, { type SQLStatement } from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from './erased-ciphertext.mts'

/**
 * How an erased column is overwritten. Every overwrite keeps the column valid for its CHECK
 * constraints and never collides with a real value:
 * - `redact`: ciphertext becomes the literal `erased`; a NULL stays NULL so row-shape checks hold.
 * - `null`: a user id reference is dropped.
 * - `key`: a storage key becomes `erased:<row id>`, which stays unique.
 * - `hex64`: a 64-character lookup token becomes a per-row digest, NULL stays NULL.
 * - `digest`: a 32-byte identity digest becomes a per-row digest.
 */
export type CopyrightRetentionErasureKind = 'redact' | 'null' | 'key' | 'hex64' | 'digest'

export type CopyrightRetentionErasureTable = {
  table: string
  columns: Record<string, CopyrightRetentionErasureKind>
  /** The rows of the table that belong to one notice. */
  scope: (noticeId: string) => SQLStatement
}

/** Prefix of an overwritten storage key; a real key never starts with it. */
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
    },
    id => sql`id = ${id}`,
  ),
  table(
    'copyright_notice_submissions',
    { submitted_by_user_id: 'null', body_ciphertext: 'redact' },
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
  table('copyright_notice_evidence_artifacts', { storage_key: 'key' }, viaSubmissions),
  table('copyright_notice_email_intakes', { raw_storage_key: 'key' }, id =>
    sql`id IN `.append(emailIntakesOf(id)),
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
  table('copyright_notice_email_thread_references', { lookup_token: 'hex64' }, viaEmailIntakes),
  table('copyright_notice_email_intake_notice_links', { matched_reference_lookup: 'hex64' }),
  table(
    'copyright_notice_email_intake_recommendations',
    { structured_output_ciphertext: 'redact' },
    viaEmailIntakes,
  ),
  table(
    'copyright_notice_email_intake_reviews',
    { rationale_ciphertext: 'redact' },
    viaEmailIntakes,
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
  table('copyright_notice_delivery_intents', {
    body_ciphertext: 'redact',
    failure_ciphertext: 'redact',
  }),
  table(
    'copyright_notice_delivery_recipients',
    { email_ciphertext: 'redact' },
    id =>
      sql`copyright_notice_delivery_intent_id IN (SELECT id FROM copyright_notice_delivery_intents
        WHERE copyright_notice_id = ${id})`,
  ),
  table('copyright_notice_lifecycle_change_rationales', { review_rationale_ciphertext: 'redact' }),
]

const OVERWRITE: Record<CopyrightRetentionErasureKind, (column: string) => string> = {
  redact: column =>
    `CASE WHEN ${column} IS NULL THEN NULL ELSE '${COPYRIGHT_ERASED_CIPHERTEXT}' END`,
  null: () => 'NULL',
  key: () => `'${COPYRIGHT_ERASED_KEY_PREFIX}' || id::text`,
  hex64: column =>
    `CASE WHEN ${column} IS NULL THEN NULL
      ELSE encode(sha256(convert_to('erased:' || id::text, 'UTF8')), 'hex') END`,
  digest: () => `sha256(convert_to('erased:' || id::text, 'UTF8'))`,
}

/** The in-place overwrite of one table's rows for a notice. Names come only from the spec above. */
export function eraseCopyrightRetentionTableSql(
  spec: CopyrightRetentionErasureTable,
  noticeId: string,
): SQLStatement {
  const assignments = Object.entries(spec.columns)
    .map(([column, kind]) => `${column} = ${OVERWRITE[kind](column)}`)
    .join(', ')
  return sql`/* eraseCopyrightRetentionTable */`
    .append(`\n    UPDATE ${spec.table} SET ${assignments} WHERE `)
    .append(spec.scope(noticeId))
}
