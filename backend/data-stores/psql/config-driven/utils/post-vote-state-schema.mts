/** Current ballots arbitrate concurrent transitions; post_votes retains the event history. */
export const POST_VOTE_STATE_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS post_vote_states (
  post_id UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  id UUID NOT NULL,
  score SMALLINT CHECK (score IS NULL OR score BETWEEN -2 AND 2),
  score_is_neutral BOOLEAN NOT NULL DEFAULT FALSE,
  score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE,
  outbound_activitypub_like_activity_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  CHECK (NOT score_is_neutral OR score IS NOT DISTINCT FROM 0),
  CHECK (NOT score_is_semantic OR score IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_post_vote_states__user_id_post_id
ON post_vote_states (user_id, post_id);
COMMENT ON INDEX idx_post_vote_states__user_id_post_id IS 'Post-ordered keyset walk of one voter''s current ballots (votes-by-user pages and the per-user election fan-out); the (post_id, user_id) primary key cannot serve user-first order.';
CREATE INDEX IF NOT EXISTS idx_post_vote_states__user_id_id_post_id_score
ON post_vote_states (user_id, id DESC) INCLUDE (post_id, score);
COMMENT ON INDEX idx_post_vote_states__user_id_id_post_id_score IS 'Newest-first index-only walk of one viewer''s current ballots (recommended topics); id is the UUIDv7 of the latest cast, so a re-cast moves the ballot to the front.';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'post_vote_states'::regclass
      AND tgname = 'trigger_post_vote_states_updated_at'
  ) THEN
    CREATE TRIGGER trigger_post_vote_states_updated_at
    BEFORE UPDATE ON post_vote_states
    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
  END IF;
END $$;
COMMENT ON TABLE post_vote_states IS 'One current ballot per post and user; its atomic transition chooses the ActivityPub Like epoch before appending history.';
COMMENT ON COLUMN post_vote_states.post_id IS 'The post whose current ballot is owned by this row.';
COMMENT ON COLUMN post_vote_states.user_id IS 'The voter whose current choice is stored independently of ballot history.';
COMMENT ON COLUMN post_vote_states.score IS 'Current ballot value; NULL records an explicit clear.';
COMMENT ON COLUMN post_vote_states.score_is_neutral IS 'Whether zero is an explicit neutral choice rather than an older implicit zero.';
COMMENT ON COLUMN post_vote_states.score_is_semantic IS 'Whether the ballot uses current choice-strength semantics.';
COMMENT ON COLUMN post_vote_states.id IS 'Copied UUIDv7 identity of the current ballot transition; current state remains authoritative after history expires.';
COMMENT ON COLUMN post_vote_states.outbound_activitypub_like_activity_id IS 'Opaque outbound Like protocol identity retained across positive score changes.';`
