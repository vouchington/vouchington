import { read, withPrimaryReads, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Per-attempt AI runs for email-intake recommendations. The immutable recommendation stays
 * success-only evidence; its retained identity is what a completed run references, so retiring an
 * old recommendation partition never blocks on a run.
 */

/** Idempotent batch admission: maps each receipt to its new run or its existing active run; a receipt that is erased or already has its recommendation is absent, so a replayed SES job never buys a second model call. */
export async function admitCopyrightEmailRecommendationRuns(
  intakeIds: readonly string[],
): Promise<Map<string, string>> {
  const runs = new Map<string, string>()
  if (intakeIds.length === 0) return runs
  const { rows } = await write<{
    id: string
    subject_id: string
  }>(sql`/* admitCopyrightEmailRecommendationRuns */
    INSERT INTO copyright_notice_email_intake_recommendation_runs (copyright_notice_email_intake_receipt_id)
    SELECT receipt.id FROM copyright_notice_email_intake_receipts receipt
    WHERE receipt.id = ANY(${intakeIds}::uuid[]) AND receipt.erased_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intakes done
        WHERE done.id = receipt.id AND done.recommendation_completed_at IS NOT NULL
      )
    ON CONFLICT (copyright_notice_email_intake_receipt_id)
      WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL DO NOTHING
    RETURNING id, copyright_notice_email_intake_receipt_id AS subject_id`)
  for (const row of rows) runs.set(row.subject_id, row.id)
  const existing = intakeIds.filter(id => !runs.has(id))
  if (existing.length === 0) return runs
  const { rows: active } = await withPrimaryReads(() =>
    read<{ id: string; subject_id: string }>(sql`/* getActiveCopyrightEmailRecommendationRuns */
      SELECT id, copyright_notice_email_intake_receipt_id AS subject_id FROM copyright_notice_email_intake_recommendation_runs
      WHERE copyright_notice_email_intake_receipt_id = ANY(${existing}::uuid[])
        AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`),
  )
  for (const row of active) runs.set(row.subject_id, row.id)
  return runs
}

export async function admitCopyrightEmailRecommendationRun(
  intakeId: string,
): Promise<string | null> {
  return (await admitCopyrightEmailRecommendationRuns([intakeId])).get(intakeId) ?? null
}

export async function isCopyrightEmailRecommendationRunActive(runId: string): Promise<boolean> {
  const { rows } = await withPrimaryReads(() =>
    read<{ exists: boolean }>(sql`/* isCopyrightEmailRecommendationRunActive */
      SELECT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_recommendation_runs
        WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
      ) AS exists`),
  )
  return rows[0]?.exists ?? false
}

/** Success wins: only a still-active run completes, in the same transaction as its result. */
export async function completeCopyrightEmailRecommendationRun(
  query: TransactionQuery,
  runId: string,
  intakeId: string,
  recommendationId: string,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(sql`/* completeCopyrightEmailRecommendationRun */
    UPDATE copyright_notice_email_intake_recommendation_runs
    SET completed_at = clock_timestamp(), copyright_notice_email_intake_recommendation_id = ${recommendationId}
    WHERE id = ${runId} AND copyright_notice_email_intake_receipt_id = ${intakeId}
      AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id`)
  return rows.length === 1
}

/** Definitive terminal failure only; never retries or provider deferrals. */
export async function markCopyrightEmailRecommendationRunFailed(runId: string): Promise<void> {
  await write(sql`/* markCopyrightEmailRecommendationRunFailed */
    UPDATE copyright_notice_email_intake_recommendation_runs SET failed_at = clock_timestamp()
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`)
}

/** The input no longer applies (erased receipt or missing source); no result will be written. */
export async function markCopyrightEmailRecommendationRunExpired(runId: string): Promise<void> {
  await write(sql`/* markCopyrightEmailRecommendationRunExpired */
    UPDATE copyright_notice_email_intake_recommendation_runs SET expired_at = clock_timestamp()
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`)
}
