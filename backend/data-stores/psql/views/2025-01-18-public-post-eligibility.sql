-- Keep this view a single flat SELECT: no top-level WITH and no UNION ALL.
-- A subquery carrying a non-empty cteList fails is_simple_subquery()/is_simple_union_all() in
-- the planner, so PostgreSQL cannot pull this view up into an enclosing query. Any consumer that
-- joins this view on post_id (e.g. view_community_metrics.post_count) then pays a correlated
-- re-scan of the whole posts table per row instead of an ordinary parameterized index lookup.
-- See #10785.
--
-- root_post is reached via `root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)`,
-- so every root-scoped predicate below reads a bare root_post.<col> — root_post is always
-- present, never NULL, because a top-level post (root_id IS NULL) joins root_post to itself.
--
-- A LEFT JOIN on the plain, un-wrapped `root_post.id = candidate_post.root_id` (with every
-- root-scoped predicate instead wrapped as COALESCE(root_post.<col>, candidate_post.<col>)) was
-- also considered. It keeps the correlated per-candidate join from #10785 index-driven (confirmed
-- via EXPLAIN against view_community_metrics.post_count: 15.442ms for 5 communities), but the
-- COALESCE-in-join-key shape below was kept instead: it matches the candidate/root shape
-- `buildPublicPostEligibilityFilter` already documents (every root-scoped predicate read directly
-- off root_post, none wrapped in COALESCE), and it does not need a LEFT JOIN rewrite to avoid
-- resource pressure — see #11081. The join key's COALESCE hides the
-- "root_post.id = candidate_post.id" identity that holds for ~99.9% of rows, so an unfiltered
-- whole-view reader like getPlatformStats() gets a genuine self-join and the planner sorts the
-- candidate side to feed a Merge Join. At the EXPLAIN harness's declared 32MB work_mem
-- (EXPLAIN_WORK_MEM in explain-analyze.mts), that sort is ~10MB for the ~100k eligible posts in
-- the CI capture and stays in memory — no spill, no resource-pressure-baseline.mts entry needed.
CREATE OR REPLACE VIEW view_public_post_eligibility AS
  SELECT candidate_post.id AS post_id, candidate_post.post_type
  FROM posts candidate_post
  JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
  LEFT JOIN user_suspensions root_suspension
    ON root_suspension.user_id = root_post.created_by_id
   AND root_suspension.lifted_at IS NULL
  LEFT JOIN user_suspensions candidate_suspension
    ON candidate_suspension.user_id = candidate_post.created_by_id
   AND candidate_suspension.lifted_at IS NULL
  WHERE candidate_post.deleted_at IS NULL
  AND candidate_post.approved_at IS NOT NULL
  AND candidate_post.archived_at IS NULL
  AND candidate_suspension.user_id IS NULL
  AND root_post.deleted_at IS NULL
  AND root_post.approved_at IS NOT NULL
  AND root_post.archived_at IS NULL
  AND root_post.privacy = 'public'
  AND root_post.broadcast = 'everyone'
  AND (
    root_post.community_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM communities publication_community
      JOIN community_post_reviews publication_review
        ON publication_review.community_id = publication_community.id
       AND publication_review.post_id = root_post.id
       AND publication_review.approved_at IS NOT NULL
       AND publication_review.rejected_at IS NULL
       AND publication_review.unpublished_at IS NULL
      WHERE publication_community.id = root_post.community_id
        AND publication_community.deleted_at IS NULL
        AND publication_community.archived_at IS NULL
        AND publication_community.visibility = 'public'
      OFFSET 0
    )
  )
  AND (
    root_post.post_type <> 'story'
    OR EXISTS (
      SELECT 1
      FROM post__stories post_story
      JOIN stories publication_story
        ON publication_story.id = post_story.story_id
       AND publication_story.deleted_at IS NULL
      JOIN rss_feed_items story_item
        ON story_item.story_id = publication_story.id
       AND story_item.deleted_at IS NULL
      WHERE post_story.post_id = root_post.id
        AND EXISTS (
          SELECT 1
          FROM rss_feed_item_sources story_source
          JOIN rss_feeds story_feed ON story_feed.id = story_source.rss_feed_id
          WHERE story_source.rss_feed_item_id = story_item.id
            AND story_feed.deleted_at IS NULL
            AND story_feed.is_enabled = TRUE
            AND story_feed.is_discoverable = TRUE
          OFFSET 0
        )
      OFFSET 0
    )
  )
  AND root_suspension.user_id IS NULL;

COMMENT ON VIEW view_public_post_eligibility IS 'Canonical anonymous discovery eligibility for authored posts. Keep equivalent to buildPublicPostEligibilityFilter; integration tests compare both owners.';
