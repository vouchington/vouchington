import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { cleanupAiUsageRecords } from '@services/data-retention/cleanup-ai-usage'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import {
  buildMonthlyPartitionName,
  createMonthlyPartitions,
} from '@vouchington/postgres/partitions'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { AI_USAGE_TOTAL_RAW_ROWS } from '../seed-data/ai-usage-totals.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'
import { seedAiUsageRetentionCapacity } from './ai-usage-retention-capacity-fixture.mts'

const pageSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
const june = new Date('2083-06-30T00:00:00Z')
const july = new Date('2083-07-01T00:00:00Z')
const now = new Date('2084-02-01T00:00:00Z')
const recent = new Date('2084-01-01T00:00:00Z')
const monthStarts = ['2083-06-01', '2083-07-01']
const seededAmounts = [10, 11]

export async function runAiUsageRetentionCapacityScenario() {
  const scenario = 'ai-usage-retention-full-fold-page'
  const dates = [june, july, recent]
  const months = dates.map(date =>
    buildMonthlyPartitionName('ai_usage_records', date.getUTCFullYear(), date.getUTCMonth() + 1),
  )
  const {
    rows: [reserved],
  } = await write<{ in_use: boolean }>(sql`
    /* checkAiUsageRetentionCapacityMonths */
    SELECT EXISTS (SELECT 1 FROM unnest(${months}::text[]) AS owned(name) WHERE to_regclass(owned.name) IS NOT NULL)
      OR EXISTS (SELECT 1 FROM ai_usage_global_monthly_rollups WHERE month_start_on = ANY(${monthStarts}::date[]))
      AS in_use
  `)
  assert.equal(reserved?.in_use, false, 'The EXPLAIN fixture must own its months')
  const prefix = `explain-ai-retention-${randomUUID()}`
  const split = pageSize / 2
  const pageIds = Array.from({ length: pageSize + 1 }, (_, i) =>
    seedUuidAtTimestamp((i < split ? june : july).getTime() + i, i),
  )
  const recentId = seedUuidAtTimestamp(recent.getTime(), 0)
  const responseKeyId = seedUuidAtTimestamp(recent.getTime(), 1)
  const keptId = pageIds[split]!
  const ids = [...pageIds, recentId]
  const {
    rows: [cursor],
  } = await write<{ cursor_id: string | null; sweep_upper_bound_id: string | null }>(
    '/* saveAiUsageRetentionCapacityCursor */ SELECT cursor_id, sweep_upper_bound_id FROM ai_usage_retention_cursors',
  )
  const {
    rows: [community],
  } = await write<{ id: string }>(sql`
    /* seedAiUsageRetentionCapacity:community */
    INSERT INTO communities (name, slug, created_via, created_by_id)
    VALUES ('Explain AI retention', ${prefix}, 'system', ${seedUser.id}) RETURNING id
  `)
  const communityId = community!.id
  const {
    rows: [tier],
  } = await write<{ id: string }>(sql`
    /* seedAiUsageRetentionCapacity:tier */
    INSERT INTO ai_service_tiers (service_tier) VALUES (${prefix}) RETURNING id
  `)
  const tierId = tier!.id

  const resetFixture = () =>
    seedAiUsageRetentionCapacity({
      ids,
      communityId,
      prefix,
      tierId,
      responseKeyId,
      keptId,
      monthStarts,
      seededAmounts,
    })

  let monthsCreated = false
  try {
    await using setup = await beginTransaction()
    // The late shard owns these reserved months in the disposable EXPLAIN database.
    for (const date of dates) {
      await createMonthlyPartitions(setup, {
        tables: [{ table: 'ai_usage_records', pastMonths: 0, futureMonths: 0 }],
        baseDate: date,
      })
    }
    await setup.commit()
    monthsCreated = true
    await resetFixture()
    await write(`/* analyzeAiUsageRetentionCapacity */
      ANALYZE ai_usage_records, ai_usage_provider_response_keys,
        ai_usage_community_monthly_rollups, ai_usage_global_monthly_rollups`)
    registerScenarioContract(scenario, {
      expectations: [],
      seededRows: { ai_usage_records: AI_USAGE_TOTAL_RAW_ROWS + ids.length },
      crossPartition: {
        ai_usage_records:
          'The cursor walks time buckets and the fold deletes the exact IDs it selected.',
      },
    })
    await runAndCapture(
      scenario,
      async () => {
        const result = await cleanupAiUsageRecords({
          now,
          lowerBoundDate: june,
          batchSize: pageSize,
          maxBatches: 1,
        })
        assert.deepEqual(result, {
          deleted: pageSize - 1,
          hasMore: true,
          cursorId: pageIds[pageSize - 1],
        })
        const { rows: remaining } = await write<{ id: string }>(sql`
          /* inspectAiUsageRetentionCapacity:remaining */
          SELECT id FROM ai_usage_records WHERE id = ANY(${ids}::uuid[]) ORDER BY id
        `)
        assert.deepEqual(
          remaining.map(row => row.id),
          [keptId, pageIds[pageSize], recentId],
        )
        const { rows: keys } = await write<{ ai_usage_record_id: string }>(sql`
          /* inspectAiUsageRetentionCapacity:responseKey */
          SELECT ai_usage_record_id FROM ai_usage_provider_response_keys WHERE id = ${responseKeyId}
        `)
        assert.deepEqual(keys, [{ ai_usage_record_id: keptId }])
        const { rows: rollups } = await write<{
          count: number
          input: number
          output: number
          cost: number
        }>(sql`
          /* inspectAiUsageRetentionCapacity:rollups */
          SELECT request_count::integer AS count, input_tokens::integer AS input,
            output_tokens::integer AS output, cost_microunits::integer AS cost
          FROM (
            SELECT 0 AS scope, month_start_on, request_count, input_tokens, output_tokens, cost_microunits
            FROM ai_usage_global_monthly_rollups WHERE month_start_on = ANY(${monthStarts}::date[])
            UNION ALL
            SELECT 1, month_start_on, request_count, input_tokens, output_tokens, cost_microunits
            FROM ai_usage_community_monthly_rollups WHERE community_id = ${communityId}
          ) AS rollups ORDER BY scope, month_start_on
        `)
        const expected = [seededAmounts[0]! + split, seededAmounts[1]! + split - 1].map(count => ({
          count,
          input: count * 20,
          output: count * 5,
          cost: count * 2,
        }))
        assert.deepEqual(rollups, [...expected, ...expected])
      },
      undefined,
      ['cleanupAiUsagePage.candidates', 'cleanupAiUsagePage.foldAndDelete'],
      { afterCapture: resetFixture },
    )
  } finally {
    await using query = await beginTransaction()
    await query(sql`/* cleanupAiUsageRetentionCapacity:raw */
      DELETE FROM ai_usage_records WHERE id = ANY(${ids}::uuid[]) AND agent_slug = ${prefix}`)
    await query(sql`/* cleanupAiUsageRetentionCapacity:globalRollups */
      DELETE FROM ai_usage_global_monthly_rollups WHERE month_start_on = ANY(${monthStarts}::date[])`)
    await query(sql`/* cleanupAiUsageRetentionCapacity:community */
      DELETE FROM communities WHERE id = ${communityId}`)
    await query(sql`/* cleanupAiUsageRetentionCapacity:tier */
      DELETE FROM ai_service_tiers WHERE id = ${tierId}`)
    if (cursor) {
      await query(sql`/* restoreAiUsageRetentionCapacityCursor */
        UPDATE ai_usage_retention_cursors SET cursor_id = ${cursor.cursor_id},
          sweep_upper_bound_id = ${cursor.sweep_upper_bound_id} WHERE is_singleton`)
    } else {
      await query(
        '/* removeAiUsageRetentionCapacityCursor */ DELETE FROM ai_usage_retention_cursors WHERE is_singleton',
      )
    }
    if (monthsCreated) {
      for (const month of months) {
        await query(`/* detachAiUsageRetentionCapacityMonth */
          ALTER TABLE ai_usage_records DETACH PARTITION ${month}`)
        await query(`/* cleanupAiUsageRetentionCapacityMonth */ DROP TABLE ${month}`)
      }
    }
    await query.commit()
  }
}
