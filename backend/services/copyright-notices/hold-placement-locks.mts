import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Case targets are inserted together at case creation; fence the whole domain before notice rows. */
export async function lockCopyrightNoticeHoldPlacements(
  noticeId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockCopyrightNoticeHoldPlacements */
    SELECT pg_advisory_xact_lock(hashtextextended(concat('image-placement:', placement_id), 0))
    FROM (
      SELECT DISTINCT placement_id FROM copyright_notice_targets
      WHERE copyright_notice_id = ${noticeId} ORDER BY placement_id
    ) ordered_placements
  `)
}
