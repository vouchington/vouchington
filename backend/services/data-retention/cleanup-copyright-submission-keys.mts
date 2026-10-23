import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { DataRetentionLimits } from './config.mts'

type CleanupPage = { scanned: number; cleared: number; hasMore: boolean }

/** Raw receipt keys expire after 30 days; compact exact-replay identities remain durable. */
export async function cleanupCopyrightSubmissionKeys(
  limits: DataRetentionLimits,
  now = new Date(),
  requestIds?: readonly string[],
): Promise<CleanupPage> {
  if (requestIds && requestIds.length > limits.batchSize)
    throw new RangeError('Scoped copyright submission key cleanup must fit one page')
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000)
  const upperId = getMinUUIDv7ForDate(cutoff)
  const result: CleanupPage = { scanned: 0, cleared: 0, hasMore: false }
  // oxlint-disable no-await-in-loop -- each committed page advances the durable cursor.
  for (let batch = 0; batch < (requestIds ? 1 : limits.maxBatches); batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: maxBatches caps pages and each page scans at most batchSize indexed keys.
    const page = await cleanupCopyrightSubmissionKeyPage(limits.batchSize, upperId, requestIds)
    result.scanned += page.scanned
    result.cleared += page.cleared
    result.hasMore = page.hasMore
    if (!page.hasMore) break
  }
  // oxlint-enable no-await-in-loop
  return result
}

async function cleanupCopyrightSubmissionKeyPage(
  pageSize: number,
  upperId: string,
  requestIds?: readonly string[],
): Promise<CleanupPage> {
  await using query = await beginTransaction()
  if (!requestIds)
    await query(`/* ensureCopyrightSubmissionKeyCursor */
    INSERT INTO copyright_submission_key_retention_cursors (family)
    VALUES ('submission_request') ON CONFLICT DO NOTHING`)
  const progress = requestIds
    ? []
    : (
        await query<{ cursor_record_id: string | null }>(
          `/* lockCopyrightSubmissionKeyCursor */
     SELECT cursor_record_id FROM copyright_submission_key_retention_cursors
     WHERE family = 'submission_request' FOR UPDATE`,
        )
      ).rows
  const { rows: candidates } = requestIds
    ? await query<{ id: string }>(
        `/* listScopedCopyrightSubmissionKeys */
        SELECT id FROM copyright_notice_submission_requests
        WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [requestIds],
      )
    : await query<{ id: string }>(
        `/* listCopyrightSubmissionKeys */
        SELECT id FROM copyright_notice_submission_requests
        WHERE id < $1::uuid AND ($2::uuid IS NULL OR id > $2::uuid)
        ORDER BY id LIMIT $3`,
        [upperId, progress[0]?.cursor_record_id ?? null, pageSize + 1],
      )
  const pageIds = candidates.slice(0, pageSize).map(row => row.id)
  let cleared = 0
  if (pageIds.length > 0) {
    await query(`/* enableCopyrightSubmissionKeyRetention */
      SET LOCAL app.copyright_submission_key_retention = 'on'`)
    const updated = await query(
      `/* clearExpiredCopyrightSubmissionKeys */
      UPDATE copyright_notice_submission_requests SET idempotency_key = NULL
      WHERE id = ANY($1::uuid[]) AND id < $2::uuid AND idempotency_key IS NOT NULL`,
      [pageIds, upperId],
    )
    cleared = updated.rowCount ?? 0
  }
  const hasMore = !requestIds && candidates.length > pageSize
  if (!requestIds)
    await query(
      `/* checkpointCopyrightSubmissionKeyCursor */
    UPDATE copyright_submission_key_retention_cursors
    SET cursor_record_id = $1 WHERE family = 'submission_request'`,
      [hasMore ? pageIds.at(-1) : null],
    )
  await query.commit()
  return { scanned: pageIds.length, cleared, hasMore }
}
