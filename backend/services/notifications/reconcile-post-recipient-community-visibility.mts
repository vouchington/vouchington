export const POST_NOTIFICATION_RECIPIENT_COMMUNITY_VISIBILITY = `
  (NOT EXISTS (SELECT 1 FROM posts community_post WHERE community_post.id = $6 AND community_post.community_id IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM posts community_post
      JOIN communities community ON community.id = community_post.community_id
      JOIN community_post_reviews community_review ON community_review.post_id = COALESCE(community_post.root_id, community_post.id) AND community_review.community_id = community.id
      WHERE community_post.id = $6 AND community.deleted_at IS NULL
        AND community_review.approved_at IS NOT NULL AND community_review.rejected_at IS NULL AND community_review.unpublished_at IS NULL
        AND (community.visibility = 'public' OR EXISTS (SELECT 1 FROM community_members community_member WHERE community_member.community_id = community.id AND community_member.user_id = recipients.user_id AND community_member.removed_at IS NULL))
    )
  )`
