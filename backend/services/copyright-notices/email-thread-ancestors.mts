import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightEmailThreadReferenceRow } from './email-thread-references.mts'

/** Both arrival orders take the same private-token locks before either reads for an edge. */
export async function lockCopyrightEmailThreadTokens(
  transaction: TransactionQuery,
  lookupTokens: readonly string[],
): Promise<void> {
  const tokens = [...new Set(lookupTokens)].toSorted()
  if (tokens.length === 0) return
  await transaction(sql`/* lockCopyrightEmailThreadTokens */
    SELECT pg_advisory_xact_lock(hashtextextended(ordered.lookup_token, 0))
    FROM (
      SELECT unnest(${tokens}::text[]) AS lookup_token
      ORDER BY lookup_token
    ) ordered
  `)
}

export async function insertCopyrightEmailThreadReferences(
  transaction: TransactionQuery,
  intakeId: string,
  rows: readonly CopyrightEmailThreadReferenceRow[],
): Promise<Map<string, string>> {
  const tokenIds = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    rows.map(row => row.lookup_digest),
  )
  const payload = JSON.stringify(
    rows.map(row => ({
      token_id: tokenIds.get(row.lookup_digest)!,
      reference_kind: row.reference_kind,
    })),
  )
  await transaction(sql`/* insertCopyrightEmailThreadReferences */
    INSERT INTO copyright_notice_email_thread_references (
      copyright_notice_email_intake_id, token_id, reference_kind
    )
    SELECT ${intakeId}::uuid AS intake_id, reference.token_id, reference.reference_kind
    FROM jsonb_to_recordset(${payload}::jsonb) AS reference(
      token_id uuid, reference_kind copyright_notice_email_thread_reference_kinds
    )
    ORDER BY intake_id, reference.token_id, reference.reference_kind
    ON CONFLICT (copyright_notice_email_intake_id, token_id, reference_kind) DO NOTHING
  `)
  return tokenIds
}

/** Resolve private input digests once at ingestion; persisted joins use only token UUIDs. */
export async function resolveCopyrightEmailThreadTokenIds(
  transaction: TransactionQuery,
  lookupDigests: readonly string[],
): Promise<Map<string, string>> {
  const digests = [...new Set(lookupDigests)].toSorted()
  if (digests.length === 0) return new Map()
  await transaction(sql`/* resolveCopyrightEmailThreadTokenIds:insert */
    INSERT INTO copyright_notice_email_thread_tokens (lookup_digest)
    SELECT digest FROM unnest(${digests}::text[]) AS input(digest)
    ORDER BY digest ON CONFLICT (lookup_digest) DO NOTHING`)
  const { rows } = await transaction<{ id: string; lookup_digest: string }>(
    sql`/* resolveCopyrightEmailThreadTokenIds:read */
      SELECT id, lookup_digest FROM copyright_notice_email_thread_tokens
      WHERE lookup_digest = ANY(${digests}::text[])`,
  )
  assert(rows.length === digests.length, 500, 'Copyright email thread token resolution incomplete')
  return new Map(rows.map(row => [row.lookup_digest, row.id]))
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
        ON parent.token_id = own.token_id
       AND parent.reference_kind = 'message_id'
       AND parent.copyright_notice_email_intake_id <> own.copyright_notice_email_intake_id
      WHERE own.copyright_notice_email_intake_id = ${intakeId}
        AND own.reference_kind IN ('in_reply_to', 'references')
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_thread_references extra
          WHERE extra.token_id = own.token_id AND extra.reference_kind = 'message_id'
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
        ON reference.token_id = own_message.token_id
       AND reference.reference_kind IN ('in_reply_to', 'references')
       AND reference.copyright_notice_email_intake_id <> own_message.copyright_notice_email_intake_id
      WHERE own_message.copyright_notice_email_intake_id = ${intakeId}
        AND own_message.reference_kind = 'message_id'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_thread_references other_message
          WHERE other_message.token_id = own_message.token_id
            AND other_message.reference_kind = 'message_id'
            AND other_message.copyright_notice_email_intake_id <> own_message.copyright_notice_email_intake_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM copyright_notice_email_thread_references reply_message
          JOIN copyright_notice_email_thread_references duplicate_reply_message
            ON duplicate_reply_message.token_id = reply_message.token_id
           AND duplicate_reply_message.reference_kind = 'message_id'
           AND duplicate_reply_message.copyright_notice_email_intake_id <> reply_message.copyright_notice_email_intake_id
          WHERE reply_message.copyright_notice_email_intake_id = reference.copyright_notice_email_intake_id
            AND reply_message.reference_kind = 'message_id'
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
      ON other_message.token_id = own_message.token_id
     AND other_message.reference_kind = 'message_id'
     AND other_message.copyright_notice_email_intake_id <> own_message.copyright_notice_email_intake_id
    WHERE own_message.copyright_notice_email_intake_id = ${intakeId}
      AND own_message.reference_kind = 'message_id'
    LIMIT 1
  `)
  return rows.length > 0
}
