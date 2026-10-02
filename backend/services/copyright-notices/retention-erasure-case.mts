import { beginBoundedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightRetentionEligibleSql } from './retention-erasure-eligibility.mts'
import { lockCopyrightRetentionCase } from './retention-erasure-preservation.mts'
import { deleteCopyrightEvidenceObjectVersions } from './retention-erasure-s3.mts'
import {
  COPYRIGHT_ERASED_KEY_PREFIX,
  COPYRIGHT_RETENTION_ERASURE,
  eraseCopyrightRetentionTableSql,
} from './retention-erasure-spec.mts'

const CONNECTION_TIMEOUT_MS = 5_000
const STATEMENT_TIMEOUT_MS = 20_000

export type CopyrightRetentionCaseOutcome = 'erased' | 'ineligible'

function scopeOf(table: string, noticeId: string) {
  return COPYRIGHT_RETENTION_ERASURE.find(entry => entry.table === table)!.scope(noticeId)
}

/**
 * Evidence-bucket keys that only this case references. A key another case's intake or artifact
 * still points at stays in the bucket; this case's own pointer to it is overwritten regardless.
 */
function evidenceKeysSql(noticeId: string) {
  return sql`/* listCopyrightRetentionEvidenceKeys */
    WITH own_intake AS (
      SELECT id, raw_storage_key AS key FROM copyright_notice_email_intakes WHERE `
    .append(scopeOf('copyright_notice_email_intakes', noticeId))
    .append(
      sql`
    ), own_artifact AS (
      SELECT id, storage_key AS key FROM copyright_notice_evidence_artifacts WHERE `,
    )
    .append(scopeOf('copyright_notice_evidence_artifacts', noticeId))
    .append(
      sql`
    ), own_key AS (
      SELECT key FROM own_intake UNION SELECT key FROM own_artifact
    )
    SELECT key FROM own_key
    WHERE key IS NOT NULL AND NOT starts_with(key, ${COPYRIGHT_ERASED_KEY_PREFIX})
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intakes other
        WHERE other.raw_storage_key = own_key.key AND other.id NOT IN (SELECT id FROM own_intake)
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_evidence_artifacts other
        WHERE other.storage_key = own_key.key AND other.id NOT IN (SELECT id FROM own_artifact)
      )
    ORDER BY key`,
    )
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
  await lockCopyrightRetentionCase(transaction, noticeId)
  const { rows: stillEligible } = await transaction<{ id: string }>(
    sql`/* recheckCopyrightRetentionEligibility */`
      .append(copyrightRetentionEligibleSql(options.now, options.cutoff))
      .append(sql`SELECT id FROM eligible WHERE id = ${noticeId}`),
  )
  if (stillEligible.length === 0) return 'ineligible'
  const { rows: keyRows } = await transaction<{ key: string }>(evidenceKeysSql(noticeId))
  const keys = keyRows.map(row => row.key)
  await deleteCopyrightEvidenceObjectVersions(keys)
  await transaction(sql`SET LOCAL app.copyright_retention_erasure = 'on'`)
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    // oxlint-disable-next-line no-await-in-loop -- one transaction connection runs its statements in order.
    await transaction(eraseCopyrightRetentionTableSql(spec, noticeId))
  }
  await transaction(sql`/* insertCopyrightRetentionErasure */
    INSERT INTO copyright_notice_retention_erasures (copyright_notice_id, retention_days, erased_object_count)
    VALUES (${noticeId}, ${options.retentionDays}, ${keys.length})`)
  await transaction.commit()
  return 'erased'
}
