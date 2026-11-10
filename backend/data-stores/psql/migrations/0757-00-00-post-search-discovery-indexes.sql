-- Stable hot rank for the direct hot and trending walks. Each index is named by the
-- scenario that orders on this expression. Topic recommendations use the post-type indexes.
-- Fixed-epoch log rank is immutable; positive-net zero-confidence posts use a finite bottom rank.

-- Cover the score input so hot and trending continuations can project their rank from the
-- ordered index instead of sorting the positive-score index before LIMIT.
CREATE INDEX IF NOT EXISTS idx_posts__stable_hot_rank__id
  ON posts ((CASE WHEN votes_score_sort > 0 THEN
    LN(votes_score_sort::DOUBLE PRECISION) +
    EXTRACT(EPOCH FROM (uuid_extract_timestamp(id) - TIMESTAMPTZ '2026-01-01 00:00:00+00'))
      / 259200.0 * LN(2.0)
    ELSE -1e300::DOUBLE PRECISION END) DESC, id DESC)
  INCLUDE (votes_score_sort)
  WHERE deleted_at IS NULL AND votes_score_net > 0;

CREATE INDEX IF NOT EXISTS idx_posts__post_type__stable_hot_rank__id
  ON posts (post_type, (CASE WHEN votes_score_sort > 0 THEN
    LN(votes_score_sort::DOUBLE PRECISION) +
    EXTRACT(EPOCH FROM (uuid_extract_timestamp(id) - TIMESTAMPTZ '2026-01-01 00:00:00+00'))
      / 259200.0 * LN(2.0)
    ELSE -1e300::DOUBLE PRECISION END) DESC, id DESC)
  WHERE deleted_at IS NULL AND votes_score_net > 0;

CREATE INDEX IF NOT EXISTS idx_posts__community_id__votes_score_sort__id
  ON posts (community_id, votes_score_sort DESC, id DESC)
  WHERE community_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts__community_id__stable_hot_rank__id
  ON posts (community_id, (CASE WHEN votes_score_sort > 0 THEN
    LN(votes_score_sort::DOUBLE PRECISION) +
    EXTRACT(EPOCH FROM (uuid_extract_timestamp(id) - TIMESTAMPTZ '2026-01-01 00:00:00+00'))
      / 259200.0 * LN(2.0)
    ELSE -1e300::DOUBLE PRECISION END) DESC, id DESC)
  INCLUDE (votes_score_sort)
  WHERE community_id IS NOT NULL AND deleted_at IS NULL AND votes_score_net > 0;
