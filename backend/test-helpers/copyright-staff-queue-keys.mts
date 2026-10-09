import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { decodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../services/copyright-notices/read-models-staff.mts'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'

type CursorKey = { id: string; tier: number; timestamp: string }
type Key = CursorKey & { before: string }

export async function firstOwnedKey(
  query: TransactionQuery,
  ids: readonly string[],
  boost: boolean,
  now: Date,
): Promise<Key> {
  const { rows } = await query<Key>(
    sql`/* firstOwnedCopyrightQueueKey */`.append(
      copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost, now }),
    ).append(sql` SELECT id, tier,
      to_char(waiting_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp,
      to_char((waiting_since - interval '1 microsecond') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS before
      FROM queue_key WHERE id = ANY(${[...ids]}::uuid[])
      ORDER BY tier, waiting_since, id LIMIT 1`),
  )
  if (!rows[0]) throw new Error('Owned queue fixture has no native start key')
  return rows[0]
}

export async function suffixCount(
  query: TransactionQuery,
  key: Key,
  boost: boolean,
  now: Date,
): Promise<number> {
  const { rows } = await query<{ count: number }>(
    sql`/* countCopyrightQueueSnapshotSuffix */`.append(
      copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost, now }),
    ).append(sql` SELECT count(*)::int AS count FROM queue_key
      WHERE (tier, waiting_since, id) > (${key.tier}, ${key.before}::timestamptz, ${key.id}::uuid)`),
  )
  if (!rows[0] || rows[0].count < 1) throw new Error('Owned queue suffix is empty')
  return rows[0].count
}

export async function nativeKeyPage(
  query: TransactionQuery,
  after: string,
  boost: boolean,
  limit: number,
  now: Date,
): Promise<CursorKey[]> {
  const cursor = decodeScopedTierPreciseUuidCursor(
    after,
    copyrightStaffQueueCursorScope,
    'Invalid diagnostic cursor',
  )
  const { rows } = await query<CursorKey>(
    sql`/* readCopyrightQueueSnapshotKeyPage */`.append(
      copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost, now }),
    ).append(sql` SELECT id, tier,
      to_char(waiting_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp
      FROM queue_key
      WHERE (tier, waiting_since, id) > (${cursor.tier}, ${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)
      ORDER BY tier, waiting_since, id LIMIT ${limit + 1}`),
  )
  return rows
}
