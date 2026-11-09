import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { prepareAiUsageMonth } from '@data-stores/psql/ai-usage-monthly-partition'
import { recordAiUsage } from '@services/ai-usage/record'
import { buildMonthlyPartitionName } from '@vouchington/postgres/partitions'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const usage = {
  inputTokens: 10,
  cacheReadTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  outputTokens: 2,
  reasoningOutputTokens: 0,
}

export async function runAiUsageLookupScenarios(): Promise<void> {
  const month = new Date()
  const partition = buildMonthlyPartitionName(
    'ai_usage_records',
    month.getUTCFullYear(),
    month.getUTCMonth() + 1,
  )
  const { rows } = await write<{ attached: boolean }>(sql`/* explainAiUsageMonthFixture */
    SELECT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhparent = 'ai_usage_records'::regclass
        AND inhrelid = to_regclass(${partition})
    ) AS attached
  `)
  if (!rows[0]?.attached) throw new Error(`EXPLAIN needs the prepared AI usage month ${partition}`)

  registerScenarioContract('ai-usage-month-attached', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['pg_inherits_parent_index', 'pg_inherits_relid_seqno_index'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'pg_inherits', max: 2 },
    ],
  })
  await runAndCapture(
    'ai-usage-month-attached',
    () => prepareAiUsageMonth(month),
    undefined,
    'isAiUsageMonthAttached',
    { exactCapturedNames: ['isAiUsageMonthAttached'] },
  )

  const serviceTier = `explain-ai-tier-${randomUUID()}`
  const noiseTiers = Array.from({ length: 1000 }, (_, index) => `${serviceTier}-noise-${index}`)
  const agentSlug = `explain-ai-usage-${randomUUID()}`
  const options = {
    agentSlug,
    provider: 'openai',
    transport: 'direct',
    model: 'gpt-6-luna',
    serviceTier,
    usage,
  }
  const lower = timestampToUuidv7LowerBound(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  )
  const upper = timestampToUuidv7LowerBound(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
  )
  try {
    await write(sql`/* explainAiUsageTierNoise */
      INSERT INTO ai_service_tiers (service_tier)
      SELECT tier FROM unnest(${noiseTiers}::text[]) AS tier
      ORDER BY tier ON CONFLICT (service_tier) DO NOTHING
    `)
    await recordAiUsage(options)
    await write('/* explainAiUsageTierStatistics */ ANALYZE ai_service_tiers')
    registerScenarioContract('ai-usage-tier-existing', {
      expectations: [
        { kind: 'queryBinds', token: 'service_tier' },
        { kind: 'usesIndexes', indexes: ['ai_service_tiers_service_tier_key'] },
        { kind: 'maxProcessedRows', relation: 'ai_service_tiers', max: 2 },
      ],
    })
    await runAndCapture(
      'ai-usage-tier-existing',
      () => recordAiUsage(options),
      undefined,
      'findAiUsageTier',
      { exactCapturedNames: ['registerAiUsageTier', 'findAiUsageTier', 'recordAiUsage'] },
    )
  } finally {
    await write(sql`/* explainAiUsageLookupCleanup:rows */
      DELETE FROM ai_usage_records
      WHERE id >= ${lower}::uuid AND id < ${upper}::uuid
        AND agent_slug = ${agentSlug}
    `)
    await write(sql`/* explainAiUsageLookupCleanup:tier */
      DELETE FROM ai_service_tiers WHERE service_tier = ANY(${[serviceTier, ...noiseTiers]}::text[])
    `)
  }
}
