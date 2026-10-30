import { beginTransaction, type QueryExecutor, type TransactionQuery } from '@data-stores/psql'
import {
  ensureAiUsageMonthForWrite,
  needsAiUsageMonthCreation,
} from '@data-stores/psql/ai-usage-monthly-partition'
import sql from 'sql-template-strings'
import { MODEL_PRICES } from '@modules/model-providers/pricing-table'
import type { ModelUsage } from '@vouchington/ai/providers'
import { getUsageCostMicrounits } from '@vouchington/ai/usage'

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
  /** A live caller transaction; call before taking ledger/tier locks so this routine owns their order. */
  query?: TransactionQuery
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
  if (options.createdAt && needsAiUsageMonthCreation(options.createdAt, new Date())) {
    if (options.query) {
      // ast-grep-ignore: no-three-sequential-awaits -- FK parent locks must precede partition DDL, and the INSERT must follow creation in the same transaction.
      const tierId = await lockAiUsageForeignKeyParents(options.query, options)
      await ensureAiUsageMonthForWrite(options.query, options.createdAt)
      await insertAiUsage(options, options.query, tierId)
      return
    }
    await using transaction = await beginTransaction()
    // ast-grep-ignore: no-three-sequential-awaits -- FK parent locks must precede partition DDL, and the INSERT must follow creation before commit.
    const tierId = await lockAiUsageForeignKeyParents(transaction, options)
    await ensureAiUsageMonthForWrite(transaction, options.createdAt)
    await insertAiUsage(options, transaction, tierId)
    await transaction.commit()
    return
  }
  if (options.query) {
    const tierId = await registerAiUsageTier(options.query, options.serviceTier)
    await insertAiUsage(options, options.query, tierId)
    return
  }
  await using transaction = await beginTransaction()
  const tierId = await registerAiUsageTier(transaction, options.serviceTier)
  await insertAiUsage(options, transaction, tierId)
  await transaction.commit()
}

/** Lock referenced rows before the partition parent's DDL lock to match deletion FK lock order. */
async function lockAiUsageForeignKeyParents(
  transaction: QueryExecutor,
  options: RecordAiUsageOptions,
): Promise<string> {
  // Creating a child may take an ACCESS EXCLUSIVE lock on this FK target. Acquire it before the
  // tier upsert or any other row lock, so an ordinary writer cannot hold the tier relation while
  // waiting for the row that this transaction owns.
  await transaction(sql`/* lockAiUsageForeignKeyParents:tierTable */
    LOCK TABLE ai_service_tiers IN ACCESS EXCLUSIVE MODE`)
  if (options.communityId) {
    await transaction(sql`/* lockAiUsageForeignKeyParents:community */
      SELECT id FROM communities WHERE id = ${options.communityId} FOR KEY SHARE`)
  }
  if (options.postId) {
    await transaction(sql`/* lockAiUsageForeignKeyParents:post */
      SELECT id FROM posts WHERE id = ${options.postId} FOR KEY SHARE`)
  }
  if (options.classifierRunId) {
    await transaction(sql`/* lockAiUsageForeignKeyParents:classifier */
      SELECT id FROM classifier_run_identities WHERE id = ${options.classifierRunId} FOR KEY SHARE`)
  }
  const tierId = await registerAiUsageTier(transaction, options.serviceTier)
  await transaction(sql`/* lockAiUsageForeignKeyParents:currency */
    SELECT code FROM currencies WHERE code = 'usd' FOR KEY SHARE`)
  return tierId
}

async function registerAiUsageTier(run: QueryExecutor, serviceTier: string): Promise<string> {
  const { rows } = await run<{ id: string }>(sql`/* registerAiUsageTier */
    INSERT INTO ai_service_tiers (service_tier) VALUES (${serviceTier})
    ON CONFLICT (service_tier) DO UPDATE SET service_tier = EXCLUDED.service_tier
    RETURNING id`)
  const id = rows[0]?.id
  if (!id) throw new Error('AI service tier registration returned no row')
  return id
}

async function insertAiUsage(
  options: RecordAiUsageOptions,
  run: QueryExecutor,
  tierId: string,
): Promise<void> {
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
  await run(sql`/* recordAiUsage */
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
