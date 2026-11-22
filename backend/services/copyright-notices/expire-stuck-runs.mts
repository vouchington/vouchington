import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * SQL recovery for a copyright AI run whose job crashed or stalled past its attempts before the
 * worker could persist the failure. Each function marks one page of active runs older than
 * `cutoffId` (a UUIDv7 bound computed once per sweep) failed in a single statement, so the next
 * dispatch sweep admits a fresh run with a new id. The update is conditional on the run still being
 * active, so a run that finished meanwhile is left alone. Returns the rows marked: a full page means
 * another page may follow. `runIds` only scopes a test to rows it owns.
 */

export async function expireStuckCopyrightEmailRecommendationRunPage(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* expireStuckCopyrightEmailRecommendationRuns */
    UPDATE copyright_notice_email_intake_recommendation_runs SET failed_at = clock_timestamp()
    WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
      AND id IN (
        SELECT id FROM copyright_notice_email_intake_recommendation_runs
        WHERE id < ${cutoffId}::uuid
          AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql` ORDER BY id LIMIT ${batchSize})
    RETURNING id`)
  return (await write<{ id: string }>(query)).rows.length
}

export async function expireStuckCopyrightAppealRecommendationRunPage(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* expireStuckCopyrightAppealRecommendationRuns */
    UPDATE copyright_notice_appeal_recommendation_runs SET failed_at = clock_timestamp()
    WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
      AND id IN (
        SELECT id FROM copyright_notice_appeal_recommendation_runs
        WHERE id < ${cutoffId}::uuid
          AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql` ORDER BY id LIMIT ${batchSize})
    RETURNING id`)
  return (await write<{ id: string }>(query)).rows.length
}

export async function expireStuckCopyrightSubmissionGuidanceRunPage(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* expireStuckCopyrightSubmissionGuidanceRuns */
    UPDATE copyright_notice_submission_guidance_runs SET failed_at = clock_timestamp()
    WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL
      AND id IN (
        SELECT id FROM copyright_notice_submission_guidance_runs
        WHERE id < ${cutoffId}::uuid
          AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql` ORDER BY id LIMIT ${batchSize})
    RETURNING id`)
  return (await write<{ id: string }>(query)).rows.length
}
