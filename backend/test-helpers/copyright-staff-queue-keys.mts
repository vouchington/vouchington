import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'

export type QueueAnchor = {
  id: string
  tier: number
  timestamp: string
}

/** Exact native tuples for committed owned cases and controls; no shared queue walk. */
export async function copyrightQueueAnchors(ids: readonly string[], boost: boolean) {
  const { rows } = await write<QueueAnchor>(
    sql`/* copyrightQueueAnchors */`.append(
      copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost }),
    ).append(sql` SELECT owned.id, owned.tier,
      to_char(owned.waiting_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp
      FROM queue_key owned
      WHERE owned.id = ANY(${[...ids]}::uuid[])
      ORDER BY owned.tier, owned.waiting_since, owned.id`),
  )
  if (rows.length !== new Set(ids).size) throw new Error('Owned queue anchor disappeared')
  return rows
}
