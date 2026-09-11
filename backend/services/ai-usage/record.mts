import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { calcCostMicrounits, normalizeCachedInputTokens } from '@modules/openai-utils/pricing'
import type { OpenAIUsage } from '@modules/openai-utils/create-response'

export interface RecordAiUsageOptions {
  /** OpenAI Responses API id. When present, repeated recording is an idempotent no-op. */
  responseId?: string
  /** The community this call is scoped to, if any. Most non-moderation agents have none. */
  communityId?: string | null
  postId?: string | null
  agentSlug: string
  /** The model OpenAI actually served (`response.model`), not the requested alias. */
  model: string
  /** The service tier OpenAI actually served (`response.service_tier`), not the requested tier. */
  serviceTier: string
  usage: OpenAIUsage
  /** Runs inside the caller's transaction instead of a fresh connection -- e.g. the
   *  openai-background-responses sweeper (#8836), which must delete its registry row and write
   *  this ledger row atomically so a failure between the two never silently drops the row. */
  query?: QueryExecutor
  /**
   * The response's true creation time (openai_background_responses.created_at), for a background
   * response recorded after its request day. daily-total.mts buckets spend by id-range, and
   * ai_usage_records.id's UUIDv7 timestamp otherwise defaults to "now" -- the moment this INSERT
   * runs, not the moment the request started -- so a response created before UTC midnight but
   * recorded after it would misattribute its cost to the following day. Omit for a foreground
   * response, which always records the same tick it completes.
   */
  createdAt?: Date
}

export type RecordAiUsageResult = 'recorded' | 'already-recorded'

type RecordedRow = { recorded: boolean }

export async function recordAiUsage(options: RecordAiUsageOptions): Promise<RecordAiUsageResult> {
  const { responseId, communityId, postId, agentSlug, model, serviceTier, usage, createdAt } =
    options
  const run = options.query ?? write
  const costMicrounits = calcCostMicrounits(model, serviceTier, usage)
  const cachedInputTokens = normalizeCachedInputTokens(usage)
  if (responseId !== undefined) {
    const { rows } = await run<RecordedRow>(sql`/* recordAiUsage */
      WITH claimed_response AS (
        INSERT INTO ai_usage_openai_response_keys (response_id, ai_usage_record_id)
        VALUES (
          ${responseId},
          uuidv7(COALESCE(${createdAt ?? null}::timestamptz - clock_timestamp(), INTERVAL '0'))
        )
        ON CONFLICT (response_id) DO NOTHING
        RETURNING ai_usage_record_id
      ),
      recorded_usage AS (
        INSERT INTO ai_usage_records (
          id,
          community_id,
          post_id,
          agent_slug,
          model,
          service_tier,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          pricing_status,
          cost_microunits,
          currency_code
        )
        SELECT
          ai_usage_record_id,
          ${communityId ?? null},
          ${postId ?? null},
          ${agentSlug},
          ${model},
          ${serviceTier},
          ${usage.input_tokens},
          ${cachedInputTokens},
          ${usage.output_tokens},
          ${costMicrounits === null ? 'unpriced' : 'priced'},
          ${costMicrounits},
          ${costMicrounits === null ? null : 'usd'}
        FROM claimed_response
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM recorded_usage) AS recorded
    `)
    const result = rows[0]
    if (!result) throw new Error('recordAiUsage idempotency query returned no result row')
    return result.recorded ? 'recorded' : 'already-recorded'
  }

  await run(sql`/* recordAiUsage */
    INSERT INTO ai_usage_records (
      id,
      community_id,
      post_id,
      agent_slug,
      model,
      service_tier,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      pricing_status,
      cost_microunits,
      currency_code
    )
    VALUES (
      uuidv7(COALESCE(${createdAt ?? null}::timestamptz - clock_timestamp(), INTERVAL '0')),
      ${communityId ?? null},
      ${postId ?? null},
      ${agentSlug},
      ${model},
      ${serviceTier},
      ${usage.input_tokens},
      ${cachedInputTokens},
      ${usage.output_tokens},
      ${costMicrounits === null ? 'unpriced' : 'priced'},
      ${costMicrounits},
      ${costMicrounits === null ? null : 'usd'}
    )
  `)
  return 'recorded'
}

/** True when `ai_usage_openai_response_keys` already reserves this Responses API id. */
export async function hasRecordedAiUsageResponseId(responseId: string): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(sql`/* hasRecordedAiUsageResponseId */
    SELECT EXISTS (
      SELECT 1
      FROM ai_usage_openai_response_keys
      WHERE response_id = ${responseId}
    ) AS exists
  `)
  const result = rows[0]
  if (!result) throw new Error('hasRecordedAiUsageResponseId query returned no result row')
  return result.exists
}
