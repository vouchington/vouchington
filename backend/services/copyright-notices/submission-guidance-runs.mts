import { read, withPrimaryReads, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Per-attempt AI runs for submission guidance. The immutable guidance stays success-only
 * evidence; the run row carries the terminal status clients follow.
 */

/** Idempotent batch admission: maps each subject to its new run or its existing active run; a subject that no longer accepts a run is absent. */
export async function admitCopyrightSubmissionGuidanceRuns(
  submissionIds: readonly string[],
): Promise<Map<string, string>> {
  const runs = new Map<string, string>()
  if (submissionIds.length === 0) return runs
  const { rows } = await write<{
    id: string
    subject_id: string
  }>(sql`/* admitCopyrightSubmissionGuidanceRuns */
    INSERT INTO copyright_notice_submission_guidance_runs (copyright_notice_submission_id)
    SELECT submission.id FROM copyright_notice_submissions submission
    WHERE submission.id = ANY(${submissionIds}::uuid[]) AND submission.kind IN ('counter_notice', 'court_or_ccb_hold')
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notices erased
        WHERE erased.id = submission.copyright_notice_id AND erased.evidence_erased_at IS NOT NULL
      )
    ON CONFLICT (copyright_notice_submission_id)
      WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL DO NOTHING
    RETURNING id, copyright_notice_submission_id AS subject_id`)
  for (const row of rows) runs.set(row.subject_id, row.id)
  const existing = submissionIds.filter(id => !runs.has(id))
  if (existing.length === 0) return runs
  const { rows: active } = await withPrimaryReads(() =>
    read<{ id: string; subject_id: string }>(sql`/* getActiveCopyrightSubmissionGuidanceRuns */
      SELECT id, copyright_notice_submission_id AS subject_id FROM copyright_notice_submission_guidance_runs
      WHERE copyright_notice_submission_id = ANY(${existing}::uuid[])
        AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`),
  )
  for (const row of active) runs.set(row.subject_id, row.id)
  return runs
}

export async function admitCopyrightSubmissionGuidanceRun(
  submissionId: string,
): Promise<string | null> {
  return (await admitCopyrightSubmissionGuidanceRuns([submissionId])).get(submissionId) ?? null
}

export async function isCopyrightSubmissionGuidanceRunActive(runId: string): Promise<boolean> {
  const { rows } = await withPrimaryReads(() =>
    read<{ exists: boolean }>(sql`/* isCopyrightSubmissionGuidanceRunActive */
      SELECT EXISTS (
        SELECT 1 FROM copyright_notice_submission_guidance_runs
        WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
      ) AS exists`),
  )
  return rows[0]?.exists ?? false
}

/** Success wins: only a still-active run completes, in the same transaction as its result. */
export async function completeCopyrightSubmissionGuidanceRun(
  query: TransactionQuery,
  runId: string,
  guidanceId: string,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(sql`/* completeCopyrightSubmissionGuidanceRun */
    UPDATE copyright_notice_submission_guidance_runs
    SET completed_at = clock_timestamp(), copyright_notice_submission_guidance_id = ${guidanceId}
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
    RETURNING id`)
  return rows.length === 1
}

/** An identical stored result (same submission and prompt version) completes the run. */
export async function completeCopyrightSubmissionGuidanceRunFromExisting(
  runId: string,
  submissionId: string,
  promptVersion: string,
): Promise<boolean> {
  const { rows } = await write<{ id: string }>(
    sql`/* completeCopyrightSubmissionGuidanceRunFromExisting */
    UPDATE copyright_notice_submission_guidance_runs run
    SET completed_at = clock_timestamp(), copyright_notice_submission_guidance_id = existing.id
    FROM (
      SELECT id FROM copyright_notice_submission_guidance
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
export async function markCopyrightSubmissionGuidanceRunFailed(runId: string): Promise<void> {
  await write(sql`/* markCopyrightSubmissionGuidanceRunFailed */
    UPDATE copyright_notice_submission_guidance_runs SET failed_at = clock_timestamp()
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`)
}

/** The input no longer applies (erased or missing subject); no result will be written. */
export async function markCopyrightSubmissionGuidanceRunExpired(runId: string): Promise<void> {
  await write(sql`/* markCopyrightSubmissionGuidanceRunExpired */
    UPDATE copyright_notice_submission_guidance_runs SET expired_at = clock_timestamp()
    WHERE id = ${runId} AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`)
}
