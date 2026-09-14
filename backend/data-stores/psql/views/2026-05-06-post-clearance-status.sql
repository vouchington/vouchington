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
      post_clearance_changes.created_at
    ) AS clearance_updated_at,
    -- AUTHOR-VISIBLE: exposed to post authors via ContentRemovedNotice when clearance_status='rejected'.
    -- Do not write internal moderator notes here; use a separate field for user-facing reasons.
    CASE
      WHEN posts.rejected_at IS NOT NULL OR posts.in_review_at IS NOT NULL
        THEN post_clearance_changes.public_reason_code
    END AS clearance_reason
  FROM posts
  LEFT JOIN post_clearance_changes
    ON post_clearance_changes.id = posts.latest_clearance_change_id
;
