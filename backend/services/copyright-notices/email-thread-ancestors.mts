import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightEmailThreadReferenceRow } from './email-thread-references.mts'

/** Both arrival orders take the same private-token locks before either reads for an edge. */
export async function lockCopyrightEmailThreadTokens(
  transaction: TransactionQuery,
  lookupTokens: readonly string[],
): Promise<void> {
  for (const lookupToken of [...new Set(lookupTokens)].toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- deterministic advisory-lock order prevents crossed replies from deadlocking
    await transaction(sql`/* lockCopyrightEmailThreadTokens */
      SELECT pg_advisory_xact_lock(hashtextextended(${lookupToken}, 0))
    `)
  }
}

export async function insertCopyrightEmailThreadReferences(
  transaction: TransactionQuery,
  intakeId: string,
  rows: readonly CopyrightEmailThreadReferenceRow[],
): Promise<void> {
  const payload = JSON.stringify(rows)
  await transaction(sql`/* insertCopyrightEmailThreadReferences */
    INSERT INTO copyright_notice_email_thread_references (
      copyright_notice_email_intake_id, lookup_token, reference_kind
    )
    SELECT ${intakeId}::uuid AS intake_id, reference.lookup_token, reference.reference_kind
    FROM jsonb_to_recordset(${payload}::jsonb) AS reference(
      lookup_token text, reference_kind copyright_notice_email_thread_reference_kinds
    )
    ORDER BY intake_id, reference.lookup_token, reference.reference_kind
    ON CONFLICT (copyright_notice_email_intake_id, lookup_token, reference_kind) DO NOTHING
  `)
}

/**
 * Records one immutable edge per unambiguous token. An existing edge is left untouched.
 * A token with two Message-ID claimants, and a token with none, records nothing.
 */
export async function recordCopyrightEmailAncestorEdges(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  await transaction(sql`/* recordCopyrightEmailAncestorEdges:reply */
    INSERT INTO copyright_notice_email_message_ancestors (
      reply_message_intake_id, ancestor_message_intake_id, reference_kind
    )
    SELECT ${intakeId}::uuid, resolved.ancestor_id, resolved.reference_kind
    FROM (
      SELECT DISTINCT ON (parent.copyright_notice_email_intake_id)
        parent.copyright_notice_email_intake_id AS ancestor_id, own.reference_kind
      FROM copyright_notice_email_thread_references own
      JOIN copyright_notice_email_thread_references parent
        ON parent.lookup_token = own.lookup_token
       AND parent.reference_kind = 'message_id'
       AND parent.copyright_notice_email_intake_id <> own.copyright_notice_email_intake_id
      WHERE own.copyright_notice_email_intake_id = ${intakeId}
        AND own.reference_kind IN ('in_reply_to', 'references')
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_thread_references extra
          WHERE extra.lookup_token = own.lookup_token AND extra.reference_kind = 'message_id'
            AND extra.copyright_notice_email_intake_id <> parent.copyright_notice_email_intake_id
        )
      ORDER BY parent.copyright_notice_email_intake_id,
        CASE own.reference_kind WHEN 'in_reply_to' THEN 0 ELSE 1 END
    ) resolved
    ORDER BY resolved.ancestor_id
    ON CONFLICT (reply_message_intake_id, ancestor_message_intake_id) DO NOTHING
  `)
  await transaction(sql`/* recordCopyrightEmailAncestorEdges:waiting */
    INSERT INTO copyright_notice_email_message_ancestors (
      reply_message_intake_id, ancestor_message_intake_id, reference_kind
    )
    SELECT waiting.reply_id, ${intakeId}::uuid, waiting.reference_kind
    FROM (
      SELECT DISTINCT ON (reference.copyright_notice_email_intake_id)
        reference.copyright_notice_email_intake_id AS reply_id, reference.reference_kind
      FROM copyright_notice_email_thread_references own_message
      JOIN copyright_notice_email_thread_references reference
        ON reference.lookup_token = own_message.lookup_token
       AND reference.reference_kind IN ('in_reply_to', 'references')
       AND reference.copyright_notice_email_intake_id <> own_message.copyright_notice_email_intake_id
      WHERE own_message.copyright_notice_email_intake_id = ${intakeId}
        AND own_message.reference_kind = 'message_id'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_thread_references other_message
          WHERE other_message.lookup_token = own_message.lookup_token
            AND other_message.reference_kind = 'message_id'
            AND other_message.copyright_notice_email_intake_id <> own_message.copyright_notice_email_intake_id
        )
      ORDER BY reference.copyright_notice_email_intake_id,
        CASE reference.reference_kind WHEN 'in_reply_to' THEN 0 ELSE 1 END
    ) waiting
    ORDER BY waiting.reply_id
    ON CONFLICT (reply_message_intake_id, ancestor_message_intake_id) DO NOTHING
  `)
}

/** True when this intake's own Message-ID is already claimed by another intake. */
export async function copyrightEmailMessageIdIsAmbiguous(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<boolean> {
  const { rows } = await transaction(sql`/* copyrightEmailMessageIdIsAmbiguous */
    SELECT 1
    FROM copyright_notice_email_thread_references own_message
    JOIN copyright_notice_email_thread_references other_message
      ON other_message.lookup_token = own_message.lookup_token
     AND other_message.reference_kind = 'message_id'
     AND other_message.copyright_notice_email_intake_id <> own_message.copyright_notice_email_intake_id
    WHERE own_message.copyright_notice_email_intake_id = ${intakeId}
      AND own_message.reference_kind = 'message_id'
    LIMIT 1
  `)
  return rows.length > 0
}
