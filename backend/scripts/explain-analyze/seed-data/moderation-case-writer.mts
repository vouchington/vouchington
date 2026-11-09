import { write } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'
import { MODERATION_CLUSTER_HOT_POST_ID } from './moderation-cluster-pages.mts'

const HISTORY_TIME = Date.parse('2102-01-01T00:00:00.000Z')
export const MODERATION_CASE_WRITER_HISTORY_ID = seedUuidAtTimestamp(HISTORY_TIME, 1)
export const MODERATION_CASE_WRITER_HISTORY_REPORT_COUNT = 1024

/** Add history after page scenarios so their original cluster ordering stays unchanged. */
export async function seedModerationCaseWriterHistory(): Promise<void> {
  await write(
    `/* seedModerationCaseWriterHistory:case */
    INSERT INTO moderation_cases (id, post_id, resolved_at)
    VALUES ($1::uuid, $2::uuid, '2102-01-01T00:00:00Z'::timestamptz)
    ON CONFLICT (id) DO NOTHING`,
    [MODERATION_CASE_WRITER_HISTORY_ID, MODERATION_CLUSTER_HOT_POST_ID],
  )
  const ids = Array.from({ length: MODERATION_CASE_WRITER_HISTORY_REPORT_COUNT }, (_, index) =>
    seedUuidAtTimestamp(HISTORY_TIME, 100_000 + index),
  )
  await write(
    `/* seedModerationCaseWriterHistory:reports */
    INSERT INTO moderation_reports (
      id, created_via, reporter_user_id, post_id, case_id, reason, original_reason,
      reviewed_at, resolution_action
    )
    SELECT report.id, 'system', $2::uuid, $3::uuid, $4::uuid, 'spam', 'spam',
      '2102-01-01T00:00:00Z'::timestamptz, 'dismissed'
    FROM unnest($1::uuid[]) report(id)
    ON CONFLICT (id) DO NOTHING`,
    [ids, seedUuid(0, '01'), MODERATION_CLUSTER_HOT_POST_ID, MODERATION_CASE_WRITER_HISTORY_ID],
  )
  await write(
    '/* analyzeModerationCaseWriterHistory */ ANALYZE moderation_cases, moderation_reports, moderation_report_clusters',
  )
}
