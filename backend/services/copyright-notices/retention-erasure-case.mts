import { beginBoundedTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightRetentionEligibleSql } from './retention-erasure-eligibility.mts'
import { deleteCopyrightEvidenceObjectVersions } from './retention-erasure-s3.mts'
import { lockCopyrightRetentionCaseThreadTokens } from './retention-erasure-thread-tokens.mts'
import { COPYRIGHT_RETENTION_ERASURE } from './retention-erasure-spec.mts'
import { eraseCopyrightRetentionTableSql } from './retention-erasure-update-sql.mts'

const CONNECTION_TIMEOUT_MS = 5_000
const STATEMENT_TIMEOUT_MS = 20_000

export type CopyrightRetentionCaseOutcome = 'erased' | 'ineligible'

function scopeOf(table: string, noticeId: string) {
  return COPYRIGHT_RETENTION_ERASURE.find(entry => entry.table === table)!.scope(noticeId)
}

/** Candidate identities only. This statement does not decide whether an object is exclusive. */
function evidenceObjectIdsSql(noticeId: string) {
  return sql`/* listCopyrightRetentionEvidenceObjectIds */
    SELECT DISTINCT raw_storage_object_id AS id FROM copyright_notice_email_intakes WHERE `
    .append(scopeOf('copyright_notice_email_intakes', noticeId))
    .append(sql` AND raw_storage_object_id IS NOT NULL
      UNION
      SELECT DISTINCT storage_object_id AS id FROM copyright_notice_evidence_artifacts WHERE `)
    .append(scopeOf('copyright_notice_evidence_artifacts', noticeId))
    .append(sql` AND storage_object_id IS NOT NULL ORDER BY id`)
}

/** Run after the object-row locks: READ COMMITTED must see owners that committed while locking. */
function exclusiveEvidenceObjectsSql(noticeId: string, objectIds: readonly string[]) {
  return sql`/* listCopyrightRetentionEvidenceKeys */
    WITH own_intake AS (
      SELECT id FROM copyright_notice_email_intakes WHERE `
    .append(scopeOf('copyright_notice_email_intakes', noticeId))
    .append(sql`
    ), own_artifact AS (
      SELECT id FROM copyright_notice_evidence_artifacts WHERE `)
    .append(scopeOf('copyright_notice_evidence_artifacts', noticeId)).append(sql`
    )
    SELECT object.id, object.storage_key AS key
    FROM copyright_notice_storage_objects object
    WHERE object.id = ANY(${[...objectIds]}::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intakes other
        WHERE other.raw_storage_object_id = object.id
          AND NOT EXISTS (SELECT 1 FROM own_intake WHERE own_intake.id = other.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_evidence_artifacts other
        WHERE other.storage_object_id = object.id
          AND NOT EXISTS (SELECT 1 FROM own_artifact WHERE own_artifact.id = other.id)
      )
    ORDER BY object.id`)
}

/** Lock registry rows, then use a fresh statement to see references committed during lock waits. */
export async function listCopyrightRetentionEvidenceKeys(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<{ id: string; key: string }[]> {
  const { rows: candidates } = await transaction<{ id: string }>(evidenceObjectIdsSql(noticeId))
  const objectIds = candidates.map(row => row.id)
  // FK writers take KEY SHARE on this row. An in-flight writer commits before these locks
  // succeed, or waits until this transaction finishes.
  await transaction(sql`/* lockCopyrightRetentionEvidenceObjects */
    SELECT id FROM copyright_notice_storage_objects
    WHERE id = ANY(${objectIds}::uuid[]) ORDER BY id FOR UPDATE`)
  // This must be a NEW statement: a NOT EXISTS in the locking statement sees the old snapshot.
  const { rows } = await transaction<{ id: string; key: string }>(
    exclusiveEvidenceObjectsSql(noticeId, objectIds),
  )
  return rows
}

/**
 * Erases one case: its evidence-bucket objects (every version), then its personal-data columns,
 * then the marker row, all in one transaction. The accounts party to the case are locked first, so
 * a preservation hold being placed on one of them is seen or waits, then the notice row, so a
 * concurrent child insert waits, and eligibility is checked again under those locks. The database
 * changes only after the bucket confirms every version is gone; any failure rolls the transaction
 * back and the case is picked up again by the next run. The idle timeout is raised for the bucket
 * calls.
 */
export async function eraseCopyrightRetentionCase(
  noticeId: string,
  options: { now: Date; cutoff: Date; retentionDays: number },
): Promise<CopyrightRetentionCaseOutcome> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: STATEMENT_TIMEOUT_MS,
  })
  await transaction(sql`/* setCopyrightRetentionTimeouts */
    SELECT set_config('lock_timeout', '5s', true),
      set_config('idle_in_transaction_session_timeout', '120s', true)`)
  // Ingestion locks tokens before its FK parents. If the case gained another
  // token while those locks were acquired, leave it for the next scheduled run.
  if (!(await lockCopyrightRetentionCaseThreadTokens(transaction, noticeId))) return 'ineligible'
  const { rows: stillEligible } = await transaction<{ id: string }>(
    sql`/* recheckCopyrightRetentionEligibility */`
      .append(copyrightRetentionEligibleSql(options.now, options.cutoff))
      .append(sql`SELECT id FROM eligible WHERE id = ${noticeId}`),
  )
  if (stillEligible.length === 0) return 'ineligible'
  // Capture the substantive case clock before erasure overwrites ciphertext rows and their
  // updated_at stamps. The minimal-record window must not restart for this technical write.
  const { rows: legalClocks } = await transaction<{ legal_clock_at: Date }>(sql`
    /* captureCopyrightMinimalLegalClock */
    SELECT fn_project_copyright_minimal_record_legal_clock(${noticeId}) AS legal_clock_at`)
  const legalClockAt = legalClocks[0]?.legal_clock_at
  if (!legalClockAt) throw new Error('Copyright legal clock missing for eligible case')
  const exclusiveObjects = await listCopyrightRetentionEvidenceKeys(noticeId, transaction)
  const keys = exclusiveObjects.map(row => row.key)
  await deleteCopyrightEvidenceObjectVersions(keys)
  // The per-SES locks above fence a concurrent inbound copy. Once evidence versions are gone,
  // keep only the provider identity and digest so a late replay cannot copy the MIME back.
  await transaction(sql`/* retainErasedCopyrightEmailIdentities */
    INSERT INTO copyright_notice_email_retained_identities (
      amazon_ses_message_id, raw_sha256, raw_byte_size
    ) SELECT intake.amazon_ses_message_id, intake.raw_sha256, intake.raw_byte_size
    FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notice_email_intakes intake
      ON intake.id = link.copyright_notice_email_intake_id
    WHERE link.copyright_notice_id = ${noticeId}
    ORDER BY intake.amazon_ses_message_id
    ON CONFLICT (amazon_ses_message_id) DO NOTHING`)
  await transaction(
    sql`/* enableCopyrightRetentionErasure */ SET LOCAL app.copyright_retention_erasure = 'on'`,
  )
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    // oxlint-disable-next-line no-await-in-loop -- one transaction connection runs its statements in order.
    await transaction(eraseCopyrightRetentionTableSql(spec, noticeId))
  }
  // Receipt ciphertext duplicates guidance/appeal output before the domain write. Its submission
  // FK identifies the case even when that write never completed.
  // ast-grep-ignore: no-three-sequential-awaits -- one transaction erases receipts and evidence before inserting the completion marker.
  await transaction(sql`/* eraseCopyrightAgentCallReceipts */
    UPDATE ai_agent_call_receipts SET result_ciphertext = 'erased'
    WHERE copyright_notice_submission_id IN
      (SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId})`)
  await transaction(sql`/* deleteCopyrightRetentionStorageObjects */
    DELETE FROM copyright_notice_storage_objects
    WHERE id = ANY(${exclusiveObjects.map(row => row.id)}::uuid[])`)
  await transaction(sql`/* insertCopyrightRetentionErasure */
    INSERT INTO copyright_notice_retention_erasures (
      copyright_notice_id, retention_days, erased_object_count, legal_clock_at)
    VALUES (${noticeId}, ${options.retentionDays}, ${keys.length}, ${legalClockAt})`)
  await transaction.commit()
  return 'erased'
}
