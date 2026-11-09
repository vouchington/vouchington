import { beginTransaction } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { seedUuid } from './common.mts'
import { resolveSeedAnchor, SEED_ANCHOR_DATE_ENV } from './seed-anchor.mts'

export const AI_USAGE_TOTAL_COMMUNITY_COUNT = 1000
export const AI_USAGE_TOTAL_CALLS_PER_COMMUNITY = 50
export const AI_USAGE_TOTAL_MONTHLY_CALLS = 10
export const AI_USAGE_TOTAL_RAW_ROWS =
  AI_USAGE_TOTAL_COMMUNITY_COUNT * AI_USAGE_TOTAL_CALLS_PER_COMMUNITY
const ACTOR_ID = seedUuid(5_309_000, 'a1')
const TIER_ID = seedUuid(5_309_000, 'a3')

export function aiUsageTotalsCommunityId(index: number): string {
  return seedUuid(5_309_000 + index, 'a2')
}

/** Paired paid totals precede five zero-priced and five unpriced-only communities. */
export function aiUsageTotalsUnitCost(index: number): number | null {
  return index < 990 ? 1000 - Math.floor(index / 2) : index < 995 ? 0 : null
}

/** Fixture writes both real sources of the lifetime totals view: the raw tail and the monthly rollups. */
export async function seedAiUsageTotals(): Promise<void> {
  const anchor = resolveSeedAnchor(process.env[SEED_ANCHOR_DATE_ENV]).dayAnchorMs
  const communityIds = Array.from({ length: AI_USAGE_TOTAL_COMMUNITY_COUNT + 1 }, (_, index) =>
    aiUsageTotalsCommunityId(index),
  )
  const ids = Array.from({ length: AI_USAGE_TOTAL_RAW_ROWS }, (_, index) =>
    timestampToUuidv7LowerBound(anchor - 24 * 60 * 60_000 + index),
  )
  const scopes = ids.map((_, index) =>
    aiUsageTotalsCommunityId(Math.floor(index / AI_USAGE_TOTAL_CALLS_PER_COMMUNITY)),
  )
  const unitCosts = ids.map((_, index) =>
    aiUsageTotalsUnitCost(Math.floor(index / AI_USAGE_TOTAL_CALLS_PER_COMMUNITY)),
  )
  const month = new Date(anchor)
  month.setUTCDate(1)
  month.setUTCMonth(month.getUTCMonth() - 2)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedAiUsageTotals:actor */ INSERT INTO users (id, username)
      VALUES ($1, 'seed-ai-usage-totals') ON CONFLICT (id) DO NOTHING`,
    [ACTOR_ID],
  )
  await transaction(
    `/* seedAiUsageTotals:communities */
      INSERT INTO communities (id, name, slug, created_by_id, created_via)
      SELECT id, 'AI usage ' || position, 'seed-ai-usage-totals-' || position, $2::uuid, 'api'
      FROM unnest($1::uuid[]) WITH ORDINALITY AS seed(id, position)
      ORDER BY id ON CONFLICT (id) DO NOTHING`,
    [communityIds, ACTOR_ID],
  )
  await transaction(
    `/* seedAiUsageTotals:tier */ INSERT INTO ai_service_tiers (id, service_tier)
      VALUES ($1, 'explain-ai-usage-totals') ON CONFLICT (id) DO NOTHING`,
    [TIER_ID],
  )
  await transaction(
    `/* seedAiUsageTotals:raw */
      INSERT INTO ai_usage_records (
        id, community_id, agent_slug, model_provider, provider_transport, model,
        service_tier_id, input_tokens, output_tokens, pricing_status, cost_microunits, currency_code
      )
      SELECT id, community_id, 'explain-ai-usage-totals', 'openai', 'direct', 'explain-model',
        $4::uuid, 100, 50,
        CASE WHEN cost IS NULL THEN 'unpriced' ELSE 'priced' END::ai_usage_record_pricing_statuses,
        cost, CASE WHEN cost IS NULL THEN NULL ELSE 'usd' END::currency_codes
      FROM unnest($1::uuid[], $2::uuid[], $3::bigint[]) AS seed(id, community_id, cost)
      ORDER BY id ON CONFLICT (id) DO NOTHING`,
    [ids, scopes, unitCosts, TIER_ID],
  )
  await transaction(
    `/* seedAiUsageTotals:monthly */
      INSERT INTO ai_usage_community_monthly_rollups (
        id, community_id, month_start_on, request_count, input_tokens, output_tokens,
        unpriced_request_count, cost_microunits, currency_code
      )
      SELECT id, community_id, $4::date, $5::bigint, $5::bigint * 100, $5::bigint * 50,
        CASE WHEN cost IS NULL THEN $5::bigint ELSE 0 END,
        COALESCE(cost, 0) * $5::bigint, 'usd'
      FROM unnest($1::uuid[], $2::uuid[], $3::bigint[]) AS seed(id, community_id, cost)
      ORDER BY community_id ON CONFLICT (community_id, month_start_on) DO NOTHING`,
    [
      Array.from({ length: AI_USAGE_TOTAL_COMMUNITY_COUNT }, (_, index) =>
        seedUuid(5_309_000 + index, 'a4'),
      ),
      communityIds.slice(0, AI_USAGE_TOTAL_COMMUNITY_COUNT),
      Array.from({ length: AI_USAGE_TOTAL_COMMUNITY_COUNT }, (_, index) =>
        aiUsageTotalsUnitCost(index),
      ),
      month.toISOString().slice(0, 10),
      AI_USAGE_TOTAL_MONTHLY_CALLS,
    ],
  )
  await transaction.commit()
}
