-- AI usage ledger: per-call cost tracking for every LLM agent, not only community moderation.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS ai_service_tiers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  service_tier TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
COMMENT ON TABLE ai_service_tiers IS 'Model provider service tier names (OpenAI flex/default, Anthropic standard/priority/batch) registered on first sight; each provider owns this open set and exact spelling.';
COMMENT ON COLUMN ai_service_tiers.id IS 'Stable identifier for this model provider service tier.';
COMMENT ON COLUMN ai_service_tiers.service_tier IS 'Exact provider value; never normalized.';
COMMENT ON COLUMN ai_service_tiers.created_at IS 'When this provider value was first observed.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS ai_usage_records (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  -- guardrails-disable-next-line uuid-must-be-key
  -- Nullable: agents running outside a community do not have a community scope.
  community_id UUID REFERENCES communities (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  post_id UUID REFERENCES posts (id) ON DELETE SET NULL,
  -- Set only for a classifier provider attempt; its foreign key to classifier_run_identities is added in
  -- 0736-00-00-classifier-runs.sql because that table is created later.
  -- guardrails-disable-next-line uuid-must-be-key
  classifier_run_identity_id UUID,
  agent_slug TEXT NOT NULL,
  model_provider ai_model_providers NOT NULL,
  provider_transport ai_provider_transports NOT NULL,
  model TEXT NOT NULL,
  service_tier_id UUID NOT NULL REFERENCES ai_service_tiers(id) ON DELETE RESTRICT,
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  cache_write_5m_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_write_5m_input_tokens >= 0),
  cache_write_1h_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_write_1h_input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  reasoning_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_output_tokens >= 0),
  CHECK (cached_input_tokens + cache_write_5m_input_tokens + cache_write_1h_input_tokens <= input_tokens),
  CHECK (reasoning_output_tokens <= output_tokens),
  latency_milliseconds INTEGER CHECK (latency_milliseconds >= 0),
  pricing_status ai_usage_record_pricing_statuses NOT NULL CHECK (pricing_status IN ('priced', 'unpriced')),
  cost_microunits BIGINT,
  CHECK (cost_microunits BETWEEN 0 AND 9007199254740991),
  currency_code currency_codes REFERENCES currencies(code) ON DELETE RESTRICT,
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
-- key. This non-partitioned map is the durable idempotency gate for provider-reported usage.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS ai_usage_provider_response_keys (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  response_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  ai_usage_record_id UUID NOT NULL UNIQUE
    REFERENCES ai_usage_records (id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (response_id = TRIM(response_id) AND char_length(response_id) BETWEEN 1 AND 100)
);


-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_ai_usage_records__community_id_id
  ON ai_usage_records (community_id, id DESC)
  WHERE community_id IS NOT NULL;

-- RI-usable index for the post_id FK
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_ai_usage_records__post_id
  ON ai_usage_records (post_id)
  WHERE post_id IS NOT NULL;

-- RI-usable index for the classifier_run_identity_id FK, and the per-run usage join
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_ai_usage_records__classifier_run_identity_id
  ON ai_usage_records (classifier_run_identity_id)
  WHERE classifier_run_identity_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_ai_usage_records__currency_code
  ON ai_usage_records (currency_code)
  WHERE currency_code IS NOT NULL;

COMMENT ON TABLE ai_usage_records IS 'Append-only per-call LLM usage and cost ledger for every agent that calls a model provider (Anthropic or OpenAI), not only community moderation.';
COMMENT ON TABLE ai_usage_provider_response_keys IS 'Time-bounded global idempotency map from a provider response or decision id to its single partitioned ai_usage_records row; old keys expire after provider replay is no longer expected.';

COMMENT ON COLUMN ai_usage_records.community_id IS 'The community the call is scoped to, if any; NULL for agents that run outside a community.';
COMMENT ON COLUMN ai_usage_records.post_id IS 'The post that was moderated; nullable if the post has been deleted or the call was not post-scoped.';
COMMENT ON COLUMN ai_usage_records.classifier_run_identity_id IS 'Retained classifier run identity whose provider attempt made this call; NULL for other agents.';
COMMENT ON COLUMN ai_usage_records.agent_slug IS 'The slug of the agent that made the LLM call (a moderator, or another agent workload identifier).';
COMMENT ON COLUMN ai_usage_records.model_provider IS 'The model provider that served the call.';
COMMENT ON COLUMN ai_usage_records.provider_transport IS 'How the call reached the provider: direct API, OpenRouter, or the typesafe jev transport.';
COMMENT ON COLUMN ai_usage_records.model IS 'The model actually served, from the response (e.g. gpt-6-luna-2026-10-01) — not necessarily the requested alias.';
COMMENT ON COLUMN ai_usage_records.service_tier_id IS 'Identifier of the service tier actually served (e.g. flex, default, standard), not necessarily the requested tier.';
COMMENT ON COLUMN ai_usage_records.input_tokens IS 'Number of input tokens billed for this call: every prompt token, including cached_input_tokens and the cache-write tokens.';
COMMENT ON COLUMN ai_usage_records.cached_input_tokens IS 'Of input_tokens, the number read from the prompt cache at the discounted cache-read rate.';
COMMENT ON COLUMN ai_usage_records.cache_write_5m_input_tokens IS 'Of input_tokens, the number written to the prompt cache at the default (5-minute) retention, billed at the cache-write rate.';
COMMENT ON COLUMN ai_usage_records.cache_write_1h_input_tokens IS 'Of input_tokens, the number written to the prompt cache with 1-hour retention, billed at the 1-hour cache-write rate.';
COMMENT ON COLUMN ai_usage_records.output_tokens IS 'Number of output tokens billed for this call, including any reasoning_output_tokens.';
COMMENT ON COLUMN ai_usage_records.reasoning_output_tokens IS 'Of output_tokens, the reasoning or thinking tokens when the provider reports them separately; otherwise 0.';
COMMENT ON COLUMN ai_usage_records.latency_milliseconds IS 'Milliseconds from the request leaving to the provider response body being read; NULL when the caller did not measure it.';
COMMENT ON COLUMN ai_usage_records.pricing_status IS 'Whether pricing was known when this usage record was written.';
COMMENT ON COLUMN ai_usage_records.cost_microunits IS 'Estimated cost in millionths of the major currency unit; NULL when unpriced.';
COMMENT ON COLUMN ai_usage_records.currency_code IS 'Currency of the estimated cost; NULL when unpriced.';
COMMENT ON COLUMN ai_usage_provider_response_keys.response_id IS 'Unique provider response or decision id; it prevents duplicate ledger rows across UUIDv7 ledger partitions.';
COMMENT ON COLUMN ai_usage_provider_response_keys.ai_usage_record_id IS 'The one ai_usage_records row reserved for this provider response or decision id.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_ai_usage_records__service_tier_id
  ON ai_usage_records (service_tier_id);
