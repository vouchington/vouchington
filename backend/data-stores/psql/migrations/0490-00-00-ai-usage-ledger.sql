-- AI usage ledger: per-call cost tracking for every LLM agent, not only community moderation.
-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS ai_usage_records (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  -- guardrails-disable-next-line uuid-must-be-key
  -- Nullable: agents running outside a community do not have a community scope.
  community_id UUID REFERENCES communities (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  post_id UUID REFERENCES posts (id) ON DELETE SET NULL,
  agent_slug TEXT NOT NULL,
  model TEXT NOT NULL,
  service_tier TEXT NOT NULL,
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  pricing_status TEXT NOT NULL CHECK (pricing_status IN ('priced', 'unpriced')),
  cost_microunits BIGINT,
  CHECK (cost_microunits BETWEEN 0 AND 9007199254740991),
  currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  CHECK (
    (
      pricing_status = 'priced'
      AND cost_microunits IS NOT NULL
      AND currency_code IS NOT NULL
    )
    OR (
      pricing_status = 'unpriced'
      AND cost_microunits IS NULL
      AND currency_code IS NULL
    )
  ),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) STORED
) PARTITION BY RANGE (id);

-- Global uniqueness cannot be enforced on response_id inside the range-partitioned ledger because
-- PostgreSQL requires every unique constraint on a partitioned parent to include its partition
-- key. This non-partitioned map is the durable idempotency gate for OpenAI Responses API usage.
CREATE TABLE IF NOT EXISTS ai_usage_openai_response_keys (
  response_id TEXT PRIMARY KEY,
  ai_usage_record_id UUID NOT NULL UNIQUE
    REFERENCES ai_usage_records (id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (response_id = TRIM(response_id) AND char_length(response_id) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS ai_usage_records_community_id_id_idx
  ON ai_usage_records (community_id, id DESC)
  WHERE community_id IS NOT NULL;

-- RI-usable index for the post_id FK
CREATE INDEX IF NOT EXISTS idx_ai_usage_records__post_id
  ON ai_usage_records (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_records__currency_code
  ON ai_usage_records (currency_code)
  WHERE currency_code IS NOT NULL;

COMMENT ON TABLE ai_usage_records IS 'Append-only per-call LLM usage and cost ledger for every agent that calls OpenAI, not only community moderation.';
COMMENT ON TABLE ai_usage_openai_response_keys IS 'Global idempotency map from an OpenAI Responses API response id to its single partitioned ai_usage_records row.';

COMMENT ON COLUMN ai_usage_records.community_id IS 'The community the call is scoped to, if any; NULL for agents that run outside a community.';
COMMENT ON COLUMN ai_usage_records.post_id IS 'The post that was moderated; nullable if the post has been deleted or the call was not post-scoped.';
COMMENT ON COLUMN ai_usage_records.agent_slug IS 'The slug of the agent that made the LLM call (a moderator, or another agent workload identifier).';
COMMENT ON COLUMN ai_usage_records.model IS 'The OpenAI model actually served, from the response (e.g. gpt-5.4-nano-2026-03-17) — not necessarily the requested alias.';
COMMENT ON COLUMN ai_usage_records.service_tier IS 'The OpenAI service tier actually served, from the response (e.g. flex, default) — not necessarily the requested tier.';
COMMENT ON COLUMN ai_usage_records.input_tokens IS 'Number of input tokens billed for this call, including any cached_input_tokens.';
COMMENT ON COLUMN ai_usage_records.cached_input_tokens IS 'Of input_tokens, the number served from the prompt cache at the discounted cached-input rate.';
COMMENT ON COLUMN ai_usage_records.output_tokens IS 'Number of output tokens billed for this call.';
COMMENT ON COLUMN ai_usage_records.pricing_status IS 'Whether pricing was known when this usage record was written.';
COMMENT ON COLUMN ai_usage_records.cost_microunits IS 'Estimated cost in millionths of the major currency unit; NULL when unpriced.';
COMMENT ON COLUMN ai_usage_records.currency_code IS 'Currency of the estimated cost; NULL when unpriced.';
COMMENT ON COLUMN ai_usage_openai_response_keys.response_id IS 'OpenAI Responses API response id; the primary key prevents duplicate ledger rows across UUIDv7 ledger partitions.';
COMMENT ON COLUMN ai_usage_openai_response_keys.ai_usage_record_id IS 'The one ai_usage_records row reserved for this OpenAI response id.';
