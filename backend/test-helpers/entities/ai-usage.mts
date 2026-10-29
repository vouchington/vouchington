import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'

export * from './ai-usage-classifier-runs.mts'

type InsertTestAiUsageRecordOptions = {
  communityId?: string | null
  postId?: string | null
  classifierRunId?: string | null
  latencyMs?: number | null
  agentSlug?: string
  provider?: 'anthropic' | 'openai' | 'typesafe'
  transport?: 'direct' | 'openrouter' | 'typesafe'
  model?: string
  serviceTier?: string
  inputTokens?: number
  cachedInputTokens?: number
  cacheWrite5mInputTokens?: number
  cacheWrite1hInputTokens?: number
  outputTokens?: number
  costMicrounits?: number | string | null
  currencyCode?: 'usd' | 'eur' | null
  // 'unpriced' forces cost_microunits to NULL regardless of costMicrounits, matching the real
  // recordAiUsage convention (calcCostMicrounits found no pricing-table entry for the
  // model/service-tier) -- see backend/services/ai-usage/__tests__/daily-total.test.mts.
  pricingStatus?: 'priced' | 'unpriced'
  // Overrides the `DEFAULT uuidv7()` primary key with an explicit UUIDv7. Only for tests that need
  // to place a row at a specific point in the id-ordered ledger (e.g. a UTC-day boundary) --
  // see backend/services/ai-usage/__tests__/daily-total.test.mts.
  id?: string
}

export async function insertTestAiUsageRecord(
  options: InsertTestAiUsageRecordOptions = {},
): Promise<string> {
  const {
    communityId = null,
    postId = null,
    classifierRunId = null,
    latencyMs = null,
    agentSlug = 'test-moderator',
    provider = 'openai',
    transport = 'direct',
    model = 'gpt-6-luna',
    serviceTier = 'flex',
    inputTokens = 100,
    cachedInputTokens = 0,
    cacheWrite5mInputTokens = 0,
    cacheWrite1hInputTokens = 0,
    outputTokens = 50,
    costMicrounits = 25,
    currencyCode = 'usd',
    pricingStatus = 'priced',
    id,
  } = options
  // ai_usage_records_check requires cost_microunits AND currency_code to be NULL together when
  // unpriced -- both or neither, per the real recordAiUsage convention.
  const resolvedCostMicrounits = pricingStatus === 'unpriced' ? null : costMicrounits
  const resolvedCurrencyCode = pricingStatus === 'unpriced' ? null : currencyCode
  const { rows } = await write<{ id: string }>(sql`/* insertTestAiUsageRecord */
    WITH registered_tier AS (
      INSERT INTO ai_service_tiers (service_tier) VALUES (${serviceTier})
      ON CONFLICT (service_tier) DO UPDATE SET service_tier = EXCLUDED.service_tier
      RETURNING id
    )
    INSERT INTO ai_usage_records (
      id, community_id, post_id, classifier_run_identity_id, latency_milliseconds, agent_slug,
      model_provider, provider_transport, model, service_tier_id, input_tokens,
      cached_input_tokens, cache_write_5m_input_tokens, cache_write_1h_input_tokens, output_tokens,
      pricing_status, cost_microunits, currency_code
    )
    SELECT
      COALESCE(${id ?? null}, uuidv7()), ${communityId}, ${postId}, ${classifierRunId},
      ${latencyMs}, ${agentSlug}, ${provider}, ${transport}, ${model}, registered_tier.id,
      ${inputTokens}, ${cachedInputTokens}, ${cacheWrite5mInputTokens}, ${cacheWrite1hInputTokens},
      ${outputTokens}, ${pricingStatus}, ${resolvedCostMicrounits}, ${resolvedCurrencyCode}
    FROM registered_tier
    RETURNING id
  `)
  return rows[0]!.id
}

export type TestAiUsageRecordRow = {
  model_provider: string
  provider_transport: string
  model: string
  service_tier_id: string
  input_tokens: number
  cached_input_tokens: number
  cache_write_5m_input_tokens: number
  cache_write_1h_input_tokens: number
  output_tokens: number
  reasoning_output_tokens: number
  pricing_status: string
  cost_microunits: string | null
  community_id: string | null
}

/**
 * Looks up the most recent ai_usage_records row for a given agent + post, or null if none
 * exists yet. Wait for the owned recording operation to complete before checking this snapshot.
 */
export async function findAiUsageRecordForPost(
  postId: string,
  agentSlug: string,
): Promise<TestAiUsageRecordRow | null> {
  const { rows } = await read<TestAiUsageRecordRow>(sql`/* findAiUsageRecordForPost */
    SELECT
      model_provider, provider_transport, model, tier.service_tier AS service_tier_id,
      input_tokens, cached_input_tokens,
      cache_write_5m_input_tokens, cache_write_1h_input_tokens, output_tokens,
      reasoning_output_tokens, pricing_status, cost_microunits, community_id
    FROM ai_usage_records record
    JOIN ai_service_tiers tier ON tier.id = record.service_tier_id
    WHERE post_id = ${postId} AND agent_slug = ${agentSlug}
    ORDER BY record.id DESC
    LIMIT 1
  `)
  return rows[0] ?? null
}

/** Reads the newest ledger row for a fixture-owned community and workload. */
export async function findAiUsageRecordForCommunity(
  communityId: string,
  agentSlug: string,
): Promise<TestAiUsageRecordRow | null> {
  const { rows } = await read<TestAiUsageRecordRow>(sql`/* findAiUsageRecordForCommunity */
    SELECT
      model_provider, provider_transport, model, tier.service_tier AS service_tier_id,
      input_tokens, cached_input_tokens,
      cache_write_5m_input_tokens, cache_write_1h_input_tokens, output_tokens,
      reasoning_output_tokens, pricing_status, cost_microunits, community_id
    FROM ai_usage_records record
    JOIN ai_service_tiers tier ON tier.id = record.service_tier_id
    WHERE record.community_id = ${communityId} AND record.agent_slug = ${agentSlug}
    ORDER BY record.id DESC
    LIMIT 1
  `)
  return rows[0] ?? null
}

/**
 * For agents with no post/community scope (e.g. story-post, which generates a title/summary
 * before a post exists). Every row for these agents has post_id/community_id NULL, so there is
 * no foreign key to disambiguate concurrent test writes on a dirty database -- pass the exact
 * input/output token counts the test's mocked response used instead.
 */
export async function findAiUsageRecordForAgent(
  agentSlug: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<TestAiUsageRecordRow | null> {
  const { rows } = await read<TestAiUsageRecordRow>(sql`/* findAiUsageRecordForAgent */
    SELECT
      model_provider, provider_transport, model, tier.service_tier AS service_tier_id,
      input_tokens, cached_input_tokens,
      cache_write_5m_input_tokens, cache_write_1h_input_tokens, output_tokens,
      reasoning_output_tokens, pricing_status, cost_microunits, community_id
    FROM ai_usage_records record
    JOIN ai_service_tiers tier ON tier.id = record.service_tier_id
    WHERE agent_slug = ${agentSlug}
      AND input_tokens = ${usage.inputTokens}
      AND output_tokens = ${usage.outputTokens}
    ORDER BY record.id DESC
    LIMIT 1
  `)
  return rows[0] ?? null
}

/**
 * Counts rows for a fixture-owned agent, optionally narrowed to exact token usage and UTC day.
 * findAiUsageRecordForAgent's LIMIT 1 cannot distinguish a retried provider call.
 */
export async function countAiUsageRecordsForAgent(
  agentSlug: string,
  usage?: { inputTokens: number; outputTokens: number },
  day?: string,
): Promise<number> {
  const query = sql`/* countAiUsageRecordsForAgent */
    SELECT COUNT(*) AS count FROM ai_usage_records WHERE agent_slug = ${agentSlug}
  `
  if (usage) {
    query.append(
      sql` AND input_tokens = ${usage.inputTokens} AND output_tokens = ${usage.outputTokens}`,
    )
  }
  if (day) {
    const dayStartMs = Date.parse(`${day}T00:00:00.000Z`)
    query.append(sql` AND id >= ${timestampToUuidv7LowerBound(dayStartMs)}
      AND id < ${timestampToUuidv7LowerBound(dayStartMs + 24 * 60 * 60 * 1000)}`)
  }
  const { rows } = await read<{ count: string }>(query)
  return Number(rows[0]?.count ?? 0)
}
