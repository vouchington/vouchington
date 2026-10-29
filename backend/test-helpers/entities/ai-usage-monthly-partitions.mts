import { advisoryLockPool, beginTransaction, type PoolClient, write } from '@data-stores/psql'
import {
  createMonthlyPartitions,
  buildMonthlyPartitionName,
} from '@vouchington/postgres/partitions'
import { guardAndRetireMonthlyPartition } from '../../data-stores/psql/migration-runner/guard-and-retire-monthly-partition.mts'
import { retireMonthlyPartitionCandidate } from '../../data-stores/psql/migration-runner/monthly-partitions.mts'
import { PARTITION_DROP_POLICIES } from '../../data-stores/psql/config-driven/utils/partition-drop-policies.mts'
import {
  getMonthlyPartitionUpperBound,
  type PartitionDropCandidate,
} from '../../data-stores/psql/migration-runner/partition-drop-guard.mts'
import sql from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'

/**
 * Task-owned real DDL fixture: the prelaunch monthly contract needs historical physical children
 * for bounded fold/retirement tests. Only these checked-absent children and owned rows are removed.
 */
export async function reserveTestAiUsageMonths(
  dates: readonly Date[],
): Promise<(ownedIds: readonly string[], ownedCommunityIds?: readonly string[]) => Promise<void>> {
  const client = await advisoryLockPool.connect()
  const months = new Map<string, Date>()
  const names = [
    ...new Set(
      dates.map(date =>
        buildMonthlyPartitionName(
          'ai_usage_records',
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
        ),
      ),
    ),
  ].toSorted()
  try {
    for (const name of names) {
      await client.query(
        '/* reserveTestAiUsageMonth */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [`test-ai-usage-month-${name}`],
      )
    }
    await lockDdl(client)
    try {
      for (const date of dates) {
        const name = buildMonthlyPartitionName(
          'ai_usage_records',
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
        )
        if (months.has(name)) continue
        const { rows } = await write<{ present: boolean }>(sql`/* reserveTestAiUsageMonths:absent */
        SELECT to_regclass(${name}) IS NOT NULL
          OR EXISTS (SELECT 1 FROM ai_usage_global_monthly_rollups
            WHERE month_start_on = date_trunc('month', ${date}::timestamptz)::date) AS present`)
        if (rows[0]?.present) throw new Error(`AI usage test month is already owned: ${name}`)
        months.set(name, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
        await createMonthlyPartitions(write, {
          tables: [{ table: 'ai_usage_records', pastMonths: 0, futureMonths: 0 }],
          baseDate: date,
        })
      }
    } finally {
      await unlockDdl(client)
    }
  } catch (err) {
    await lockDdl(client)
    try {
      await retireOwnedMonths(months, [])
    } finally {
      await unlockDdl(client)
    }
    client.release(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
  return async (ownedIds, ownedCommunityIds = []) => {
    try {
      await lockDdl(client)
      try {
        await retireOwnedMonths(months, ownedIds, ownedCommunityIds)
      } finally {
        await unlockDdl(client)
      }
      for (const name of names.toReversed()) {
        const { rows } = await client.query<{ unlocked: boolean }>(
          '/* releaseTestAiUsageMonth */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [`test-ai-usage-month-${name}`],
        )
        if (!rows[0]?.unlocked) throw new Error(`AI usage test month lock was not held: ${name}`)
      }
      client.release()
    } catch (err) {
      client.release(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }
}

async function lockDdl(client: PoolClient): Promise<void> {
  await client.query(`/* reserveTestAiUsagePartitionDdl */
    SELECT pg_advisory_lock(hashtextextended('test-ai-usage-partition-ddl', 0))`)
}

async function unlockDdl(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ unlocked: boolean }>(`/* releaseTestAiUsagePartitionDdl */
    SELECT pg_advisory_unlock(hashtextextended('test-ai-usage-partition-ddl', 0)) AS unlocked`)
  if (!rows[0]?.unlocked) throw new Error('AI usage partition DDL lock was not held')
}

export async function readTestAiUsageIdsForMonth(date: Date, agentSlug: string): Promise<string[]> {
  const from = timestampToUuidv7LowerBound(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const to = timestampToUuidv7LowerBound(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  const { rows } = await write<{ id: string }>(sql`/* readTestAiUsageIdsForMonth */
    SELECT id FROM ai_usage_records
    WHERE id >= ${from}::uuid AND id < ${to}::uuid AND agent_slug = ${agentSlug}
    LIMIT 2`)
  return rows.map(row => row.id)
}

/** Hold a referenced row while the real retirement guard attempts its NOWAIT fence. */
export async function probeBlockedAiUsageRetirement(
  candidate: PartitionDropCandidate,
  communityId: string | null,
): Promise<string> {
  await using holder = await beginTransaction()
  if (communityId) {
    await holder(sql`/* probeBlockedAiUsageRetirement:holdCommunity */
      SELECT id FROM communities WHERE id = ${communityId} FOR UPDATE`)
  } else {
    await holder(sql`/* probeBlockedAiUsageRetirement:holdResponseKeys */
      LOCK TABLE ai_usage_provider_response_keys IN ROW EXCLUSIVE MODE`)
  }
  await using retire = await beginTransaction()
  try {
    await guardAndRetireMonthlyPartition(
      retire,
      candidate,
      PARTITION_DROP_POLICIES.ai_usage_records,
      new Date(),
      1,
    )
    return 'unexpected-retirement'
  } catch (err) {
    return (err as { code?: string }).code ?? 'unknown-error'
  }
}

async function retireOwnedMonths(
  months: ReadonlyMap<string, Date>,
  ownedIds: readonly string[],
  ownedCommunityIds: readonly string[] = [],
): Promise<void> {
  if (ownedIds.length > 0) {
    await write(sql`/* retireOwnedAiUsageMonths:deleteOwned */
      DELETE FROM ai_usage_records WHERE id = ANY(${ownedIds}::uuid[])`)
  }
  for (const name of months.keys()) {
    const { rows } = await write<{ absent: boolean }>(sql`/* retireOwnedAiUsageMonths:absent */
      SELECT to_regclass(${name}) IS NULL AS absent`)
    if (rows[0]?.absent) continue
    const candidate: PartitionDropCandidate = {
      table: 'ai_usage_records',
      partition: name,
      upperBound: getMonthlyPartitionUpperBound('ai_usage_records', name),
    }
    const result = await retireMonthlyPartitionCandidate(
      candidate,
      new Date('9999-01-01T00:00:00Z'),
      1,
    )
    if (result.outcome !== 'dropped') {
      throw new Error(`Owned AI usage partition ${name} was not retired: ${result.reason}`)
    }
  }
  const monthStarts = [...months.values()]
  if (monthStarts.length > 0) {
    if (ownedCommunityIds.length > 0) {
      await write(sql`/* retireOwnedAiUsageMonths:communityRollups */
        DELETE FROM ai_usage_community_monthly_rollups
        WHERE community_id = ANY(${ownedCommunityIds}::uuid[])
          AND month_start_on = ANY(${monthStarts}::date[])`)
    }
    await write(sql`/* retireOwnedAiUsageMonths:globalRollups */
      DELETE FROM ai_usage_global_monthly_rollups
      WHERE month_start_on = ANY(${monthStarts}::date[])`)
  }
}
