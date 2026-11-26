import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function seedAiUsageRetentionCapacity({
  ids,
  communityId,
  prefix,
  tierId,
  responseKeyId,
  keptId,
  monthStarts,
  seededAmounts,
}: {
  ids: readonly string[]
  communityId: string
  prefix: string
  tierId: string
  responseKeyId: string
  keptId: string
  monthStarts: readonly string[]
  seededAmounts: readonly number[]
}) {
  await using query = await beginTransaction()
  await query(sql`
      /* seedAiUsageRetentionCapacity:raw */
      INSERT INTO ai_usage_records (
        id, community_id, agent_slug, model_provider, provider_transport, model, service_tier_id,
        input_tokens, output_tokens, pricing_status, cost_microunits, currency_code
      )
      SELECT id, ${communityId}, ${prefix}, 'openai', 'direct', 'fixture', ${tierId},
        20, 5, 'priced', 2, 'usd'
      FROM unnest(${ids}::uuid[]) AS fixture(id) ORDER BY id ON CONFLICT (id) DO NOTHING
    `)
  await query(sql`
      /* seedAiUsageRetentionCapacity:responseKey */
      INSERT INTO ai_usage_provider_response_keys (id, response_id, ai_usage_record_id)
      VALUES (${responseKeyId}, ${prefix}, ${keptId}) ON CONFLICT (id) DO NOTHING
    `)
  await query(sql`
      /* seedAiUsageRetentionCapacity:communityRollups */
      INSERT INTO ai_usage_community_monthly_rollups
        (community_id, month_start_on, request_count, input_tokens, output_tokens, cost_microunits, currency_code)
      SELECT ${communityId}, month, n, n * 20, n * 5, n * 2, 'usd'
      FROM unnest(${monthStarts}::date[], ${seededAmounts}::int[]) AS fixture(month, n)
      ON CONFLICT (community_id, month_start_on) DO UPDATE SET request_count = EXCLUDED.request_count,
        input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
        cost_microunits = EXCLUDED.cost_microunits
    `)
  await query(sql`
      /* seedAiUsageRetentionCapacity:globalRollups */
      INSERT INTO ai_usage_global_monthly_rollups
        (month_start_on, request_count, input_tokens, output_tokens, cost_microunits, currency_code)
      SELECT month, n, n * 20, n * 5, n * 2, 'usd'
      FROM unnest(${monthStarts}::date[], ${seededAmounts}::int[]) AS fixture(month, n)
      ON CONFLICT (month_start_on) DO UPDATE SET request_count = EXCLUDED.request_count,
        input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
        cost_microunits = EXCLUDED.cost_microunits
    `)
  await query(`/* resetAiUsageRetentionCapacityCursor */
      INSERT INTO ai_usage_retention_cursors (is_singleton) VALUES (true)
      ON CONFLICT (is_singleton) DO UPDATE SET cursor_id = NULL, sweep_upper_bound_id = NULL`)
  await query.commit()
}
