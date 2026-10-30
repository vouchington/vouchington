import sql, { type SQLStatement } from 'sql-template-strings'

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
  intakeOwnerColumn?:
    | 'id'
    | 'copyright_notice_email_intake_id'
    | 'copyright_notice_email_intake_receipt_id'
  /** The rows of the table that belong to one notice. */
  scope: (noticeId: string) => SQLStatement
}

export const own = (id: string) => sql`copyright_notice_id = ${id}`
export const viaSubmissions = (id: string) =>
  sql`copyright_notice_submission_id IN
    (SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${id})`
export const viaRestrictions = (id: string) =>
  sql`copyright_restriction_id IN (SELECT restriction.id FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${id})`
export const viaFormIntakes = (id: string) =>
  sql`copyright_notice_form_intake_id IN
    (SELECT id FROM copyright_notice_form_intakes WHERE copyright_notice_id = ${id})`
// The canonical UNIQUE receipt FK admits exactly one case link per retained receipt.
export const emailIntakesOf = (id: string) =>
  sql`(SELECT copyright_notice_email_intake_receipt_id FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_id = ${id})`
export const viaEmailIntakes = (id: string) =>
  sql`copyright_notice_email_intake_id IN `.append(emailIntakesOf(id))
export const viaTerritorialRedress = (id: string) =>
  sql`copyright_territorial_redress_request_id IN
    (SELECT id FROM copyright_territorial_redress_requests WHERE copyright_notice_id = ${id})`
export const viaEmailReceipts = (id: string) =>
  sql`copyright_notice_email_intake_receipt_id IN `.append(emailIntakesOf(id))
export const table = (
  name: string,
  columns: CopyrightRetentionErasureTable['columns'],
  scope: CopyrightRetentionErasureTable['scope'] = own,
): CopyrightRetentionErasureTable => ({
  table: name,
  columns,
  scope,
  ...(name === 'copyright_notice_email_intakes'
    ? { intakeOwnerColumn: 'id' as const }
    : scope === viaEmailReceipts
      ? { intakeOwnerColumn: 'copyright_notice_email_intake_receipt_id' as const }
      : scope === viaEmailIntakes
        ? { intakeOwnerColumn: 'copyright_notice_email_intake_id' as const }
        : name === 'copyright_notice_email_intake_notice_links'
          ? { intakeOwnerColumn: 'copyright_notice_email_intake_receipt_id' as const }
          : {}),
})
