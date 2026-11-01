import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'

type Key = { id: string; tier: number; timestamp: string; before: string }

export async function firstOwnedKey(ids: readonly string[], boost: boolean): Promise<Key> {
  const { rows } = await write<Key>(
    sql`/* firstOwnedCopyrightQueueKey */`.append(
      copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost }),
    ).append(sql` SELECT id, tier,
      to_char(waiting_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp,
      to_char((waiting_since - interval '1 microsecond') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS before
      FROM queue_key WHERE id = ANY(${[...ids]}::uuid[])
      ORDER BY tier, waiting_since, id LIMIT 1`),
  )
  if (!rows[0]) throw new Error('Owned queue fixture has no native start key')
  return rows[0]
}

/** Native key ids from just before the first owned key through the last required key. */
export async function nativeWindowIds(
  key: Key,
  requiredIds: readonly string[],
  boost: boolean,
): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    sql`/* readCopyrightQueueNativeWindow */`.append(
      copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost }),
    ).append(sql` SELECT id FROM queue_key
      WHERE (tier, waiting_since, id) > (${key.tier}, ${key.before}::timestamptz, ${key.id}::uuid)
        AND (tier, waiting_since, id) <= (
          SELECT tier, waiting_since, id FROM queue_key
          WHERE id = ANY(${[...requiredIds]}::uuid[])
          ORDER BY tier DESC, waiting_since DESC, id DESC LIMIT 1
        )
      ORDER BY tier, waiting_since, id`),
  )
  if (rows.length < 1) throw new Error('Owned queue window is empty')
  return rows.map(row => row.id)
}
