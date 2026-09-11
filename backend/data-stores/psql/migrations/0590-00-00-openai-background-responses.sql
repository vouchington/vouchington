-- edited-in-place: pre-launch, never deployed to production
-- In-flight registry for background (background: true) OpenAI responses (#8836). A response is
-- registered under a renewable creator lease as soon as its id is known and deleted once usage is
-- recorded. Expired leases are atomically transferred to a fenced sweeper owner before provider
-- teardown, and global response-id idempotency prevents duplicate accounting.
CREATE TABLE IF NOT EXISTS openai_background_responses (
  response_id TEXT PRIMARY KEY,
  agent_slug TEXT NOT NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  community_id UUID REFERENCES communities (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  post_id UUID REFERENCES posts (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  lease_token UUID NOT NULL DEFAULT uuidv7(),
  lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '3 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (response_id = TRIM(response_id) AND char_length(response_id) BETWEEN 1 AND 100)
);

-- The sweeper's only scan: expired leases in deterministic oldest-first order.
CREATE INDEX IF NOT EXISTS idx_openai_background_responses__lease_expires_at_response_id
ON openai_background_responses (lease_expires_at, response_id);

CREATE INDEX IF NOT EXISTS idx_openai_background_responses__community_id
ON openai_background_responses (community_id) WHERE community_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_openai_background_responses__post_id
ON openai_background_responses (post_id) WHERE post_id IS NOT NULL;

COMMENT ON TABLE openai_background_responses IS 'Fenced ownership registry for background OpenAI responses not yet finalized; exact-token mutations protect active creators from stale recovery workers. See backend/services/openai-background-responses.';
COMMENT ON COLUMN openai_background_responses.response_id IS 'OpenAI response id from response.created; the primary key identifies one current lease while ai_usage_openai_response_keys separately gates accounting.';
COMMENT ON COLUMN openai_background_responses.agent_slug IS 'The slug of the agent that created this background response, carried through to the eventual ai_usage_records row.';
COMMENT ON COLUMN openai_background_responses.community_id IS 'The community the call is scoped to, if any; NULL for agents that run outside a community.';
COMMENT ON COLUMN openai_background_responses.post_id IS 'The post the call is scoped to, if any; nullable if the post has been deleted or the call was not post-scoped.';
COMMENT ON COLUMN openai_background_responses.lease_token IS 'Stable owner token; recovery atomically rotates it before any provider teardown so stale owners cannot renew or finalize.';
COMMENT ON COLUMN openai_background_responses.lease_expires_at IS 'PostgreSQL-time ownership expiry; active drains renew it and the sweeper may claim only after it passes.';
COMMENT ON COLUMN openai_background_responses.created_at IS 'When this response was first registered; retained for audit, not liveness.';
