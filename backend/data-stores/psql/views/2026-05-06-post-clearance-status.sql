-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_post_clearance_status AS
  SELECT
    posts.id AS post_id,
    posts.latest_clearance_change_id,
    CASE
      WHEN posts.approved_at IS NOT NULL THEN 'approved'
      WHEN posts.rejected_at IS NOT NULL THEN 'rejected'
      WHEN posts.in_review_at IS NOT NULL THEN 'in_review'
      ELSE 'pending'
    END AS clearance_status,
    COALESCE(
      posts.approved_at,
      posts.rejected_at,
      posts.in_review_at,
      posts.clearance_changed_at
    ) AS clearance_updated_at,
    -- AUTHOR-VISIBLE: exposed to post authors via ContentRemovedNotice when clearance_status='rejected'.
    -- Do not write internal moderator notes here; use a separate field for user-facing reasons.
    CASE
      WHEN posts.rejected_at IS NOT NULL OR posts.in_review_at IS NOT NULL
        THEN posts.clearance_public_reason_code
    END AS clearance_reason
  FROM posts
;

COMMENT ON VIEW view_post_clearance_status IS 'Current post clearance derived from moderation lifecycle facts.';
