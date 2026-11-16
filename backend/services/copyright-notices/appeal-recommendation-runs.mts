import { read, withPrimaryReads, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Per-attempt AI runs for appeal recommendations. The immutable recommendation stays success-only
 * evidence; the run row carries the terminal status clients follow.
 */

/** Idempotent batch admission: maps each subject to its new run or its existing active run; a subject that no longer accepts a run is absent. */
export async function admitCopyrightAppealRecommendationRuns(
  submissionIds: readonly string[],
): Promise<Map<string, string>> {
  const runs = new Map<string, string>()
  if (submissionIds.length === 0) return runs
  const { rows } = await write<{
    id: string
    subject_id: string
  }>(sql`/* admitCopyrightAppealRecommendationRuns */
    INSERT INTO copyright_notice_appeal_recommendation_runs (copyright_notice_submission_id)
    SELECT submission.id FROM copyright_notice_submissions submission
    WHERE submission.id = ANY(${submissionIds}::uuid[]) AND submission.kind = 'appeal'
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notices erased
        WHERE erased.id = submission.copyright_notice_id AND erased.evidence_erased_at IS NOT NULL
      )
    ORDER BY submission.id ASC NULLS LAST
    ON CONFLICT (copyright_notice_submission_id)
      WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL DO NOTHING
    RETURNING id, copyright_notice_submission_id AS subject_id`)
  for (const row of rows) runs.set(row.subject_id, row.id)
  const existing = submissionIds.filter(id => !runs.has(id))
  if (existing.length === 0) return runs
  const { rows: active } = await withPrimaryReads(() =>
    read<{ id: string; subject_id: string }>(sql`/* getActiveCopyrightAppealRecommendationRuns */
      SELECT id, copyright_notice_submission_id AS subject_id FROM copyright_notice_appeal_recommendation_runs
      WHERE copyright_notice_submission_id = ANY(${existing}::uuid[])
        AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`),
  )
  for (const row of active) runs.set(row.subject_id, row.id)
  return runs
}

export async function admitCopyrightAppealRecommendationRun(
  submissionId: string,
): Promise<string | null> {
  return (await admitCopyrightAppealRecommendationRuns([submissionId])).get(submissionId) ?? null
}

export async function isCopyrightAppealRecommendationRunActive(runId: string): Promise<boolean> {
  const { rows } = await withPrimaryReads(() =>
    read<{ exists: boolean }>(sql`/* isCopyrightAppealRecommendationRunActive */
      SELECT EXISTS (
        SELECT 1 FROM copyright_notice_appeal_recommendation_runs
        WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
      ) AS exists`),
  )
  return rows[0]?.exists ?? false
}

/** Success wins: only a still-active run completes, in the same transaction as its result. */
export async function completeCopyrightAppealRecommendationRun(
  query: TransactionQuery,
  runId: string,
  recommendationId: string,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(sql`/* completeCopyrightAppealRecommendationRun */
    UPDATE copyright_notice_appeal_recommendation_runs
    SET completed_at = clock_timestamp(), copyright_notice_appeal_recommendation_id = ${recommendationId}
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id`)
  return rows.length === 1
}

/** An identical stored result (same submission and prompt version) completes the run. */
export async function completeCopyrightAppealRecommendationRunFromExisting(
  runId: string,
  submissionId: string,
  promptVersion: string,
): Promise<boolean> {
  const { rows } = await write<{ id: string }>(
    sql`/* completeCopyrightAppealRecommendationRunFromExisting */
    UPDATE copyright_notice_appeal_recommendation_runs run
    SET completed_at = clock_timestamp(), copyright_notice_appeal_recommendation_id = existing.id
    FROM (
      SELECT id FROM copyright_notice_appeal_recommendations
      WHERE copyright_notice_submission_id = ${submissionId} AND prompt_version = ${promptVersion}
      ORDER BY id DESC LIMIT 1
    ) existing
    WHERE run.id = ${runId}
      AND run.completed_at IS NULL AND run.failed_at IS NULL AND run.expired_at IS NULL
    RETURNING run.id`,
  )
  return rows.length === 1
}

/** Definitive terminal failure only; never retries or provider deferrals. */
export async function markCopyrightAppealRecommendationRunFailed(runId: string): Promise<void> {
  await write(sql`/* markCopyrightAppealRecommendationRunFailed */
    UPDATE copyright_notice_appeal_recommendation_runs SET failed_at = clock_timestamp()
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`)
}

/** The input no longer applies (erased or missing subject); no result will be written. */
export async function markCopyrightAppealRecommendationRunExpired(runId: string): Promise<void> {
  await write(sql`/* markCopyrightAppealRecommendationRunExpired */
    UPDATE copyright_notice_appeal_recommendation_runs SET expired_at = clock_timestamp()
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`)
}
