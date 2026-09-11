-- edited-in-place: pre-launch, never deployed to production
-- Remote ActivityPub likes on local posts (Phase C2). Isolated from the local voting system by
-- design: remote Likes must never affect `post_votes`/`votes_score_net` or any local ranking —
-- see docs/overview/architecture/fediverse-federation.md's Like reuse-mapping row. `ap_posts` is
-- the 1:1 AP-only tally per post (room to grow with other AP-post metadata later); `ap_post_likes`
-- is the append-only ledger of remote Like/Undo(Like) activity, one row per remote actor's like
-- state on a post.

CREATE TABLE IF NOT EXISTS ap_posts (
  post_id UUID PRIMARY KEY REFERENCES posts ON DELETE CASCADE,
  ap_likes_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  ap_likes_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_ap_posts_updated_at
BEFORE UPDATE ON ap_posts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE ap_posts IS 'AP-only like tally per post, trigger-maintained from ap_post_likes. Isolated from post_votes — remote likes never affect local ranking.';
COMMENT ON COLUMN ap_posts.post_id IS 'The local post this tally is for (1:1, lazily created on first remote like).';
COMMENT ON COLUMN ap_posts.ap_likes_score IS 'COUNT of active (non-Undo''d) ap_post_likes rows for this post. DOUBLE PRECISION to match the shape of other score columns even though every Like currently weighs 1.';
COMMENT ON COLUMN ap_posts.ap_likes_count IS 'Same value as ap_likes_score, stored separately as a plain display count in case score gains per-actor weighting later.';

CREATE TABLE IF NOT EXISTS ap_post_likes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  remote_actor_id UUID NOT NULL REFERENCES remote_actors ON DELETE CASCADE,
  like_ap_id TEXT NOT NULL,
  CHECK (char_length(like_ap_id) > 0 AND char_length(like_ap_id) <= 2048),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_post_likes__like_ap_id ON ap_post_likes (like_ap_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_post_likes__post_remote_actor ON ap_post_likes (post_id, remote_actor_id) WHERE deleted_at IS NULL;
-- RI-usable leading indexes for the post_id/remote_actor_id FKs — the unique index above is
-- predicated on deleted_at IS NULL, which the planner can't use for cascade/RESTRICT checks that
-- must also touch soft-deleted rows (see docs/development/postgres-schema-rules.md).
CREATE INDEX IF NOT EXISTS idx_ap_post_likes__post_id ON ap_post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_ap_post_likes__remote_actor_id ON ap_post_likes (remote_actor_id);

COMMENT ON TABLE ap_post_likes IS 'Append-only ledger of remote ActivityPub Like/Undo(Like) activity against local posts. FKs post_id directly (not ap_posts) so writes never depend on ap_posts row-creation order; the sync trigger below lazily creates it.';
COMMENT ON COLUMN ap_post_likes.post_id IS 'The local post that was liked.';
COMMENT ON COLUMN ap_post_likes.remote_actor_id IS 'The remote actor who sent the Like. One active row per (post_id, remote_actor_id) — see idx_ap_post_likes__post_remote_actor.';
COMMENT ON COLUMN ap_post_likes.like_ap_id IS 'The inbound Like activity''s ActivityPub `id`. Unique while active — a second live Like from the same remote actor on the same post is rejected by idx_ap_post_likes__post_remote_actor before this could collide.';
COMMENT ON COLUMN ap_post_likes.deleted_at IS 'Set by an inbound Undo(Like). NULL while the like is active. A later re-Like from the same (post_id, remote_actor_id) resurrects this same row rather than inserting a new one — see fn_sync_ap_post_likes.';

-- Keeps ap_posts in sync with the count of active (deleted_at IS NULL) ap_post_likes rows for the
-- affected post via an atomic delta-based upsert, not a read-then-write COUNT: two concurrent
-- transactions each inserting a new Like row for the same post_id (different remote actors) would
-- each COUNT from a snapshot that can't see the other's uncommitted insert, so both write the same
-- stale absolute value and one Like silently vanishes from the tally regardless of commit order.
-- `SELECT ... FOR UPDATE` on the count can't fix this either — the row that would need locking (the
-- concurrent INSERT) doesn't exist yet at lock time. A delta avoids the read entirely: an INSERT is
-- always +1 (a fresh row is never inserted already-deleted; deleted_at is only ever set later by an
-- UPDATE — see its column comment). An UPDATE compares OLD.deleted_at to NEW.deleted_at: no
-- transition (IS NOT DISTINCT FROM) skips the sync entirely; NOT NULL -> NULL (a resurrecting
-- re-Like) is +1; NULL -> NOT NULL (an Undo) is -1. `INSERT ... ON CONFLICT (post_id) DO UPDATE SET
-- col = ap_posts.col + v_delta` then applies that delta under Postgres's own row-level lock on the
-- ap_posts row, which serializes concurrent triggers for the same post: the second transaction
-- blocks on the lock and applies its delta on top of the first's just-committed value once
-- unblocked, so no delta is ever lost. Lazily creates the ap_posts row on first like (delta is
-- always +1 whenever the row doesn't exist yet); GREATEST(..., 0) floors both the initial insert
-- and the ON CONFLICT UPDATE path against a negative value in the defensive case (an out-of-order
-- Undo replay or any other delta-accounting bug must not drive the tally negative). Same
-- lazy-creation upsert shape as Phase B's fn_sync_fediverse_instance_integration_status trigger,
-- delta-accumulation instead of latest-row-wins.
CREATE OR REPLACE FUNCTION fn_sync_ap_post_likes()
RETURNS TRIGGER AS $$
DECLARE
  v_delta INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := 1;
  ELSIF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN NEW;
  ELSIF OLD.deleted_at IS NULL THEN
    v_delta := -1;
  ELSE
    v_delta := 1;
  END IF;

  INSERT INTO ap_posts (post_id, ap_likes_score, ap_likes_count)
  VALUES (NEW.post_id, GREATEST(v_delta, 0), GREATEST(v_delta, 0))
  ON CONFLICT (post_id) DO UPDATE SET
    ap_likes_score = GREATEST(ap_posts.ap_likes_score + v_delta, 0),
    ap_likes_count = GREATEST(ap_posts.ap_likes_count + v_delta, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_ap_post_likes
AFTER INSERT OR UPDATE ON ap_post_likes
FOR EACH ROW
EXECUTE FUNCTION fn_sync_ap_post_likes();
