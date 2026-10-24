import { advisoryLockPool, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'

/** Serializes test files that exercise the one production retention cursor on a dirty database. */
export async function reserveTestAiUsageRetentionSweep(): Promise<() => Promise<void>> {
  const client = await advisoryLockPool.connect()
  try {
    await client.query(`/* reserveTestAiUsageRetentionSweep */
      SELECT pg_advisory_lock(hashtextextended('test-ai-usage-retention-sweep', 0))`)
  } catch (err) {
    client.release(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
  return async () => {
    try {
      const { rows } = await client.query<{ unlocked: boolean }>(`
        /* releaseTestAiUsageRetentionSweep */
        SELECT pg_advisory_unlock(hashtextextended('test-ai-usage-retention-sweep', 0)) AS unlocked
      `)
      if (!rows[0]?.unlocked) throw new Error('AI usage retention test lock was not held')
      client.release()
    } catch (err) {
      client.release(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }
}

export async function readTestAiUsageRollups(
  communityId: string,
  monthStart: string,
): Promise<{
  communityCalls: string
  communityCost: string
  globalCalls: string
  globalCost: string
  globalUnpricedCalls: string
  communityCurrency: string | null
  globalCurrency: string | null
}> {
  const { rows } = await write<{
    community_calls: string
    community_cost: string
    global_calls: string
    global_cost: string
    global_unpriced_calls: string
    community_currency: string | null
    global_currency: string | null
  }>(sql`/* readTestAiUsageRollups */
    SELECT
      COALESCE((SELECT request_count FROM ai_usage_community_monthly_rollups
        WHERE community_id = ${communityId} AND month_start_on = ${monthStart}::date), 0)::text
        AS community_calls,
      COALESCE((SELECT cost_microunits FROM ai_usage_community_monthly_rollups
        WHERE community_id = ${communityId} AND month_start_on = ${monthStart}::date), 0)::text
        AS community_cost,
      COALESCE((SELECT request_count FROM ai_usage_global_monthly_rollups
        WHERE month_start_on = ${monthStart}::date), 0)::text AS global_calls,
      COALESCE((SELECT cost_microunits FROM ai_usage_global_monthly_rollups
        WHERE month_start_on = ${monthStart}::date), 0)::text AS global_cost,
      COALESCE((SELECT unpriced_request_count FROM ai_usage_global_monthly_rollups
        WHERE month_start_on = ${monthStart}::date), 0)::text AS global_unpriced_calls,
      (SELECT currency_code FROM ai_usage_community_monthly_rollups
        WHERE community_id = ${communityId} AND month_start_on = ${monthStart}::date)
        AS community_currency,
      (SELECT currency_code FROM ai_usage_global_monthly_rollups
        WHERE month_start_on = ${monthStart}::date) AS global_currency
  `)
  const row = rows[0]!
  return {
    communityCalls: row.community_calls,
    communityCost: row.community_cost,
    globalCalls: row.global_calls,
    globalCost: row.global_cost,
    globalUnpricedCalls: row.global_unpriced_calls,
    communityCurrency: row.community_currency,
    globalCurrency: row.global_currency,
  }
}

export async function countTestAiUsageRows(ids: readonly string[]): Promise<number> {
  const { rows } = await write<{ count: string }>(sql`/* countTestAiUsageRows */
    SELECT count(*)::text AS count FROM ai_usage_records WHERE id = ANY(${ids}::uuid[])
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function readTestAiUsageRetentionCursor(): Promise<{
  cursorId: string | null
  sweepUpperBoundId: string | null
}> {
  const { rows } = await write<{
    cursor_id: string | null
    sweep_upper_bound_id: string | null
  }>(sql`/* readTestAiUsageRetentionCursor */
    SELECT cursor_id, sweep_upper_bound_id FROM ai_usage_retention_cursors
    WHERE is_singleton = true
  `)
  const row = rows[0]
  if (!row) throw new Error('AI usage retention cursor is missing')
  return { cursorId: row.cursor_id, sweepUpperBoundId: row.sweep_upper_bound_id }
}

export async function hasTestClassifierIdentity(id: string): Promise<boolean> {
  const { rows } = await write<{ present: boolean }>(sql`/* hasTestClassifierIdentity */
    SELECT EXISTS (SELECT 1 FROM classifier_run_identities WHERE id = ${id}) AS present
  `)
  return rows[0]?.present ?? false
}

export async function insertTestAiUsageResponseKey(id: string, usageId: string): Promise<string> {
  const responseId = `retention_${randomUUID()}`
  await write(sql`/* insertTestAiUsageResponseKey */
    INSERT INTO ai_usage_provider_response_keys (id, response_id, ai_usage_record_id)
    VALUES (${id}, ${responseId}, ${usageId})
  `)
  return responseId
}

export async function hasTestAiUsageResponseKey(responseId: string): Promise<boolean> {
  const { rows } = await write<{ present: boolean }>(sql`/* hasTestAiUsageResponseKey */
    SELECT EXISTS (
      SELECT 1 FROM ai_usage_provider_response_keys WHERE response_id = ${responseId}
    ) AS present
  `)
  return rows[0]?.present ?? false
}

export async function seedTestAiUsageCommunityRollup(
  communityId: string,
  monthStart: string,
  costMicrounits: string,
): Promise<void> {
  await write(sql`/* seedTestAiUsageCommunityRollup */
    INSERT INTO ai_usage_community_monthly_rollups (
      community_id, month_start_on, request_count, cost_microunits, currency_code
    ) VALUES (${communityId}, ${monthStart}::date, 1, ${costMicrounits}::bigint, 'usd')
  `)
}

export async function clearTestAiUsageOverflowFixture(
  communityId: string,
  monthStart: string,
  rawId: string,
): Promise<void> {
  await write(sql`/* clearTestAiUsageOverflowFixture */
    DELETE FROM ai_usage_records WHERE id = ${rawId}
  `)
  await write(sql`/* clearTestAiUsageOverflowRollup */
    DELETE FROM ai_usage_community_monthly_rollups
    WHERE community_id = ${communityId} AND month_start_on = ${monthStart}::date
  `)
}
