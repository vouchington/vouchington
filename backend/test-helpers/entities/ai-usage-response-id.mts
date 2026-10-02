import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { TestAiUsageRecordRow } from './ai-usage.mts'

export type TestAiUsageRecordAttribution = TestAiUsageRecordRow & {
  agent_slug: string
  post_id: string | null
}

/**
 * The ledger row recorded for one provider response id, with who it is attributed to. A response
 * id is unique per call, so this is exact where agent + token lookups collide on a shared database.
 * Pair with pollUntilNotNull: the insert can land after the triggering call has resolved.
 */
export async function findAiUsageRecordForResponseId(
  responseId: string,
): Promise<TestAiUsageRecordAttribution | null> {
  const { rows } = await read<TestAiUsageRecordAttribution>(sql`/* findAiUsageRecordForResponseId */
    SELECT
      record.model, record.service_tier, record.input_tokens, record.cached_input_tokens,
      record.output_tokens, record.pricing_status, record.cost_microunits, record.community_id,
      record.agent_slug, record.post_id
    FROM ai_usage_provider_response_keys key
    INNER JOIN ai_usage_records record ON record.id = key.ai_usage_record_id
    WHERE key.response_id = ${responseId}
    LIMIT 1
  `)
  return rows[0] ?? null
}
