import { hasRetiredCopyrightEmailCaseLink } from './email-thread-source.mts'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'
import type { CopyrightEmailThreadReferenceRow } from './email-thread-references.mts'
import { throwIfCopyrightEmailThreadWriteConflict } from './email-thread-write-conflict.mts'

export async function insertResolvedCopyrightEmailThreadReferences(
  transaction: TransactionQuery,
  intakeId: string,
  rows: readonly CopyrightEmailThreadReferenceRow[],
  tokenIds: ReadonlyMap<string, string>,
): Promise<void> {
  const payload = JSON.stringify(
    rows.map(row => ({
      token_id: tokenIds.get(row.lookup_digest)!,
      reference_kind: row.reference_kind,
    })),
  )
  try {
    const { rowCount } = await transaction(sql`/* insertCopyrightEmailThreadReferences */
      INSERT INTO copyright_notice_email_thread_references (
        copyright_notice_email_intake_id, token_id, reference_kind
      )
      SELECT ${intakeId}::uuid AS intake_id, reference.token_id, reference.reference_kind
      FROM jsonb_to_recordset(${payload}::jsonb) AS reference(
        token_id uuid, reference_kind copyright_notice_email_thread_reference_kinds
      )
      WHERE EXISTS (
        SELECT 1 FROM copyright_notice_email_intakes intake
        JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
        WHERE intake.id = ${intakeId} AND intake.raw_storage_object_id IS NOT NULL
          AND receipt.erased_at IS NULL
      )
      ORDER BY intake_id, reference.token_id, reference.reference_kind
      ON CONFLICT (copyright_notice_email_intake_id, token_id, reference_kind) DO NOTHING
    `)
    if (rowCount && (await hasRetiredCopyrightEmailCaseLink(transaction, intakeId)))
      throw copyrightEmailThreadChangedError()
    if (rowCount === 0) {
      const { rows: live } = await transaction(sql`/* insertCopyrightEmailThreadReferences:live */
        SELECT 1 FROM copyright_notice_email_intakes intake
        JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
        WHERE intake.id = ${intakeId} AND intake.raw_storage_object_id IS NOT NULL
          AND receipt.erased_at IS NULL LIMIT 1`)
      if (live.length === 0) throw copyrightEmailThreadChangedError()
    }
  } catch (err) {
    throwIfCopyrightEmailThreadWriteConflict(err)
    throw err
  }
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
  if (rows.length !== digests.length) throw copyrightEmailThreadChangedError()
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
  const { rows: inserted } = await transaction<{
    reply_message_intake_receipt_id: string
    ancestor_message_intake_receipt_id: string
  }>(sql`/* recordCopyrightEmailAncestorEdges */
    INSERT INTO copyright_notice_email_message_ancestors (
      reply_message_intake_receipt_id, ancestor_message_intake_receipt_id, reference_kind
    )
    WITH reply_resolved AS MATERIALIZED (
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
    ), reply_live AS MATERIALIZED (
      SELECT reply_resolved.ancestor_id, reply_resolved.reference_kind
      FROM reply_resolved
      JOIN copyright_notice_email_intakes candidate ON candidate.id = reply_resolved.ancestor_id
      JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = candidate.id
      WHERE candidate.raw_storage_object_id IS NOT NULL AND receipt.erased_at IS NULL
      ORDER BY reply_resolved.ancestor_id
    ), waiting_resolved AS MATERIALIZED (
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
    ), waiting_live AS MATERIALIZED (
      SELECT waiting_resolved.reply_id, waiting_resolved.reference_kind
      FROM waiting_resolved
      JOIN copyright_notice_email_intakes candidate ON candidate.id = waiting_resolved.reply_id
      JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = candidate.id
      WHERE candidate.raw_storage_object_id IS NOT NULL AND receipt.erased_at IS NULL
      ORDER BY waiting_resolved.reply_id
    ), edges AS (
      SELECT ${intakeId}::uuid AS reply_id, reply_live.ancestor_id,
        reply_live.reference_kind FROM reply_live
      UNION ALL
      SELECT waiting_live.reply_id, ${intakeId}::uuid AS ancestor_id,
        waiting_live.reference_kind FROM waiting_live
    )
    SELECT edges.reply_id, edges.ancestor_id, edges.reference_kind
    FROM edges ORDER BY edges.reply_id, edges.ancestor_id
    ON CONFLICT (reply_message_intake_receipt_id, ancestor_message_intake_receipt_id) DO NOTHING
    RETURNING reply_message_intake_receipt_id, ancestor_message_intake_receipt_id
  `)
  if (inserted.length > 0) {
    const intakeIds = [
      ...new Set(
        inserted.flatMap(row => [
          row.reply_message_intake_receipt_id,
          row.ancestor_message_intake_receipt_id,
        ]),
      ),
    ]
    const { rows: cases } = await transaction<{ copyright_notice_id: string }>(sql`
      /* recordCopyrightEmailAncestorEdges:cases */ SELECT DISTINCT copyright_notice_id
      FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ANY(${intakeIds}::uuid[])`)
    if (
      await readCopyrightThreadRetirement(
        transaction,
        cases.map(row => row.copyright_notice_id),
      )
    )
      throw copyrightEmailThreadChangedError()
  }
}
