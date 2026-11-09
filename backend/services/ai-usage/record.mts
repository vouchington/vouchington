import { write } from '@data-stores/psql'
import {
  AiUsageMonthPreparationError,
  needsAiUsageMonthCreation,
  prepareAiUsageMonth,
} from '@data-stores/psql/ai-usage-monthly-partition'
import sql from 'sql-template-strings'
import { MODEL_PRICES } from '@modules/model-providers/pricing-table'
import type { ModelUsage } from '@vouchington/ai/providers'
import { getUsageCostMicrounits } from '@vouchington/ai/usage'
import { getAiUsageWorkLimit } from './work-limits.mts'

export interface RecordAiUsageOptions {
  /** The community this call is scoped to, if any. Most non-moderation agents have none. */
  communityId?: string | null
  postId?: string | null
  /**
   * The classifier run whose reserved provider attempt made this call. Only classifier clients set
   * it; the per-run usage report (`@services/classifier-runs`) joins on it.
   */
  classifierRunId?: string | null
  /** Milliseconds from the request leaving to the response body being read, when measured. */
  latencyMs?: number | null
  agentSlug: string
  /** `anthropic`, `openai` or `typesafe`; the `ai_model_providers` finite set guards the column. */
  provider: string
  /** How the call reached the provider (direct API, OpenRouter, or the jev transport). */
  transport: string
  /** The model the provider actually served (`response.model`), not the requested alias. */
  model: string
  /** The service tier the provider actually served, not the requested tier. */
  serviceTier: string
  usage: ModelUsage
  /**
   * The response's true creation time (the request's start time), for a background
   * response recorded after its request day. daily-total.mts buckets spend by id-range, and
   * ai_usage_records.id's UUIDv7 timestamp otherwise defaults to "now" -- the moment this INSERT
   * runs, not the moment the request started -- so a response created before UTC midnight but
   * recorded after it would misattribute its cost to the following day. Foreground callers also
   * supply their request start time when available.
   */
  createdAt?: Date
}

export async function recordAiUsage(options: RecordAiUsageOptions): Promise<void> {
  const attempts = getAiUsageWorkLimit('record_partition_attempts')
  let needsPreparation =
    options.createdAt !== undefined && needsAiUsageMonthCreation(options.createdAt, new Date())
  let tierId: string | undefined
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (needsPreparation) {
        // no-mistakes-disable-next-line query-reached-per-item: prepare one exact month only after a missing-partition signal or for an out-of-window createdAt.
        await prepareAiUsageMonth(options.createdAt ?? new Date()) // oxlint-disable-line no-await-in-loop -- the bounded retry owns preparation and insertion together.
        needsPreparation = false
      }
      // Tier registration must commit before the ledger INSERT. Partition attachment takes the
      // ledger parent before copying its tier FK, so holding a tier row across the INSERT would
      // invert that DDL lock order. Cache the committed tier across retries.
      if (tierId === undefined) {
        // no-mistakes-disable-next-line query-reached-per-item: register one tier once before the bounded usage insert attempts.
        tierId = await registerAiUsageTier(options.serviceTier) // oxlint-disable-line no-await-in-loop -- only the first attempt registers the tier.
      }
      // no-mistakes-disable-next-line query-reached-per-item: retry the same single usage insert after concurrent partition retirement, never a per-row batch.
      await insertAiUsage(options, tierId) // oxlint-disable-line no-await-in-loop -- only a missing partition permits the next bounded insert attempt.
      return
    } catch (err) {
      if (
        attempt + 1 === attempts ||
        (!(err instanceof AiUsageMonthPreparationError && err.missing) &&
          !isMissingAiUsagePartition(err))
      )
        throw err
      // A retired empty child can disappear before preparation or after it commits.
      needsPreparation = true
    }
  }
}

function isMissingAiUsagePartition(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === '23514' &&
    error.message.includes('no partition of relation "ai_usage_records" found for row')
  )
}

async function registerAiUsageTier(serviceTier: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* registerAiUsageTier */
    INSERT INTO ai_service_tiers (service_tier) VALUES (${serviceTier})
    ON CONFLICT (service_tier) DO NOTHING
    RETURNING id`)
  if (rows[0]?.id) return rows[0].id
  const { rows: existing } = await write<{ id: string }>(sql`/* findAiUsageTier */
    SELECT id FROM ai_service_tiers WHERE service_tier = ${serviceTier}
  `)
  const id = existing[0]?.id
  if (!id) throw new Error('AI service tier registration returned no row')
  return id
}

async function insertAiUsage(options: RecordAiUsageOptions, tierId: string): Promise<void> {
  const {
    communityId,
    postId,
    classifierRunId,
    latencyMs,
    agentSlug,
    provider,
    transport,
    model,
    serviceTier,
    usage,
    createdAt,
  } = options
  const costMicrounits = getUsageCostMicrounits(
    { provider, model, serviceTier, usage },
    MODEL_PRICES,
  )
  await write(sql`/* recordAiUsage */
    INSERT INTO ai_usage_records (
      id,
      community_id,
      post_id,
      classifier_run_identity_id,
      agent_slug,
      model_provider,
      provider_transport,
      model,
      service_tier_id,
      input_tokens,
      cached_input_tokens,
      cache_write_5m_input_tokens,
      cache_write_1h_input_tokens,
      output_tokens,
      reasoning_output_tokens,
      latency_milliseconds,
      pricing_status,
      cost_microunits,
      currency_code
    )
    VALUES (uuidv7(COALESCE(${createdAt ?? null}::timestamptz - clock_timestamp(), INTERVAL '0')),
      ${communityId ?? null},
      ${postId ?? null},
      ${classifierRunId ?? null},
      ${agentSlug},
      ${provider},
      ${transport},
      ${model},
      ${tierId},
      ${usage.inputTokens},
      ${usage.cacheReadTokens},
      ${usage.cacheWrite5mTokens},
      ${usage.cacheWrite1hTokens},
      ${usage.outputTokens},
      ${usage.reasoningOutputTokens},
      ${latencyMs ?? null},
      ${costMicrounits === null ? 'unpriced' : 'priced'},
      ${costMicrounits},
      ${costMicrounits === null ? null : 'usd'})
  `)
}
