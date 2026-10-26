-- edited-in-place: pre-launch, never deployed to production
-- In-flight registry only for background OpenAI responses created outside a GlideMQ job. Worker
-- jobs persist response ids in their own job data; the global response-id key prevents duplicate
-- accounting when normal completion and age-based reconciliation overlap.
CREATE TABLE IF NOT EXISTS openai_background_responses (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  response_id TEXT UNIQUE NOT NULL,
  agent_slug TEXT NOT NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  community_id UUID REFERENCES communities (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  post_id UUID REFERENCES posts (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (response_id = TRIM(response_id) AND char_length(response_id) BETWEEN 1 AND 100)
);

-- The primary key orders UUIDv7 rows for the inline-response age scan.

CREATE INDEX IF NOT EXISTS idx_openai_background_responses__community_id
ON openai_background_responses (community_id) WHERE community_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_openai_background_responses__post_id
ON openai_background_responses (post_id) WHERE post_id IS NOT NULL;

COMMENT ON TABLE openai_background_responses IS 'Recovery registry for background OpenAI responses created outside a GlideMQ job; provider response keys gate exact accounting.';
COMMENT ON COLUMN openai_background_responses.response_id IS 'Unique OpenAI response id from response.created; ai_usage_provider_response_keys separately gates accounting.';
COMMENT ON COLUMN openai_background_responses.agent_slug IS 'The slug of the agent that created this background response, carried through to the eventual ai_usage_records row.';
COMMENT ON COLUMN openai_background_responses.community_id IS 'The community the call is scoped to, if any; NULL for agents that run outside a community.';
COMMENT ON COLUMN openai_background_responses.post_id IS 'The post the call is scoped to, if any; nullable if the post has been deleted or the call was not post-scoped.';
COMMENT ON COLUMN openai_background_responses.created_at IS 'When this response was registered; bounds age-based recovery of inline requests.';
