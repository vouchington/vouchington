import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type InsertTestAiUsageRecordOptions = {
  communityId?: string | null
  postId?: string | null
  agentSlug?: string
  model?: string
  serviceTier?: string
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  costMicrounits?: number | string
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
): Promise<void> {
  const {
    communityId = null,
    postId = null,
    agentSlug = 'test-moderator',
    model = 'gpt-5.4-nano',
    serviceTier = 'flex',
    inputTokens = 100,
    cachedInputTokens = 0,
    outputTokens = 50,
    costMicrounits = 25,
    pricingStatus = 'priced',
    id,
  } = options
  // ai_usage_records_check requires cost_microunits AND currency_code to be NULL together when
  // unpriced -- both or neither, per the real recordAiUsage convention.
  const resolvedCostMicrounits = pricingStatus === 'unpriced' ? null : costMicrounits
  const resolvedCurrencyCode = pricingStatus === 'unpriced' ? null : 'usd'
  await write(sql`
    INSERT INTO ai_usage_records (
      id, community_id, post_id, agent_slug, model, service_tier, input_tokens, cached_input_tokens,
      output_tokens, pricing_status, cost_microunits, currency_code
    )
    VALUES (
      COALESCE(${id ?? null}, uuidv7()), ${communityId}, ${postId}, ${agentSlug}, ${model},
      ${serviceTier}, ${inputTokens}, ${cachedInputTokens}, ${outputTokens}, ${pricingStatus},
      ${resolvedCostMicrounits}, ${resolvedCurrencyCode}
    )
  `)
}

export type TestAiUsageRecordRow = {
  model: string
  service_tier: string
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  pricing_status: string
  cost_microunits: string | null
  community_id: string | null
}

/**
 * Looks up the most recent ai_usage_records row for a given agent + post, or null if none
 * exists yet. Every real recordAiUsage call site fires it without awaiting (cost recording must
 * never fail the request it's billing for), so the insert can land after the triggering call has
 * already resolved -- pair this with pollUntilNotNull rather than reading once immediately after.
 */
export async function findAiUsageRecordForPost(
  postId: string,
  agentSlug: string,
): Promise<TestAiUsageRecordRow | null> {
  const { rows } = await read<TestAiUsageRecordRow>(sql`/* findAiUsageRecordForPost */
    SELECT
      model, service_tier, input_tokens, cached_input_tokens, output_tokens, pricing_status,
      cost_microunits, community_id
    FROM ai_usage_records
    WHERE post_id = ${postId} AND agent_slug = ${agentSlug}
    ORDER BY id DESC
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
      model, service_tier, input_tokens, cached_input_tokens, output_tokens, pricing_status,
      cost_microunits, community_id
    FROM ai_usage_records
    WHERE agent_slug = ${agentSlug}
      AND input_tokens = ${usage.inputTokens}
      AND output_tokens = ${usage.outputTokens}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0] ?? null
}

/**
 * Counts ai_usage_records rows for an agent + exact token usage. findAiUsageRecordForAgent's
 * LIMIT 1 can't distinguish "recorded once" from "recorded twice" -- idempotency tests (e.g. the
 * openai_background_responses compare-and-set, #8836) need the exact count.
 */
export async function countAiUsageRecordsForAgent(
  agentSlug: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countAiUsageRecordsForAgent */
    SELECT COUNT(*) AS count
    FROM ai_usage_records
    WHERE agent_slug = ${agentSlug}
      AND input_tokens = ${usage.inputTokens}
      AND output_tokens = ${usage.outputTokens}
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function countAiUsageRecordsForResponseId(responseId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countAiUsageRecordsForResponseId */
    SELECT COUNT(*) AS count
    FROM ai_usage_openai_response_keys key
    INNER JOIN ai_usage_records record ON record.id = key.ai_usage_record_id
    WHERE key.response_id = ${responseId}
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function countAiUsageOpenAIResponseKeys(responseId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countAiUsageOpenAIResponseKeys */
    SELECT COUNT(*) AS count
    FROM ai_usage_openai_response_keys
    WHERE response_id = ${responseId}
  `)
  return Number(rows[0]?.count ?? 0)
}
