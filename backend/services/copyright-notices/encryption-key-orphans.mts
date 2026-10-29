import { beginBoundedTransaction } from '@data-stores/psql'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { getCopyrightRetentionWindows } from './config.mts'
import { reclaimCopyrightEncryptionKeyReservation } from './encryption-key-orphan-reservation.mts'

/** One raw key page precedes attachment checks; skipped owners cannot starve later orphans. */
export async function sweepCopyrightEncryptionKeyOrphans(): Promise<{
  destroyed: number
  failed: number
  hasMore: boolean
}> {
  const limits = getCopyrightRetentionWindows()
  const cutoff = new Date(Date.now() - limits.encryptionOrphanGraceHours * 3_600_000)
  const upperId = getMaxUUIDv7ForDate(cutoff)
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await query(sql`/* ensureCopyrightKeyOrphanCursor */
    INSERT INTO copyright_key_orphan_cleanup_cursors (is_singleton, cursor_sweep_upper_bound)
    VALUES (true, ${upperId}) ON CONFLICT DO NOTHING`)
  const { rows: cursors } = await query<{
    cursor_key_id: string | null
    cursor_sweep_upper_bound: string | null
  }>(sql`
    /* lockCopyrightKeyOrphanCursor */ SELECT cursor_key_id, cursor_sweep_upper_bound
    FROM copyright_key_orphan_cleanup_cursors WHERE is_singleton FOR UPDATE`)
  const cursor = cursors[0]
  if (!cursor) throw new Error('Copyright key orphan cursor is missing')
  const { rows } = await query<{ id: string }>(sql`
    /* selectCopyrightKeyOrphanPage */ SELECT id FROM copyright_retention_keys
    WHERE id <= ${cursor.cursor_sweep_upper_bound ?? upperId}::uuid
      AND (${cursor.cursor_key_id}::uuid IS NULL OR id > ${cursor.cursor_key_id}::uuid)
    ORDER BY id LIMIT ${limits.caseBatchSize + 1}`)
  const page = rows.slice(0, limits.caseBatchSize)
  const hasMore = rows.length > limits.caseBatchSize
  await query(sql`/* checkpointCopyrightKeyOrphanCursor */ UPDATE copyright_key_orphan_cleanup_cursors
    SET cursor_key_id = ${hasMore ? page.at(-1)?.id : null}::uuid,
      cursor_sweep_upper_bound = ${hasMore ? (cursor.cursor_sweep_upper_bound ?? upperId) : null}::uuid WHERE is_singleton`)
  await query.commit()
  // No cursor/owner transaction remains open while independent reservation transactions run.
  let destroyed = 0
  let failed = 0
  for (let start = 0; start < page.length; start += limits.encryptionFetchConcurrency) {
    // oxlint-disable-next-line no-await-in-loop -- capped raw page and capped provider waves bound this cleanup.
    const outcomes = await Promise.allSettled(
      page
        .slice(start, start + limits.encryptionFetchConcurrency)
        // no-mistakes-disable-next-line query-reached-per-item: each capped reservation needs its own lock-and-fresh-owner transaction around an independent S3 deletion; no shared pool transaction remains open.
        .map(candidate => reclaimCopyrightEncryptionKeyReservation(candidate.id)),
    )
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') failed++
      else if (outcome.value) destroyed++
    }
  }
  return { destroyed, failed, hasMore: hasMore || failed > 0 }
}
