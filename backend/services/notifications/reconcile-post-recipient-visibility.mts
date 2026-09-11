export const POST_NOTIFICATION_RECIPIENT_VISIBILITY = `
  (recipients.user_id = $8 OR (($10 = 'everyone' OR $10 = 'users' OR ($10 = 'followers' AND EXISTS (
    SELECT 1 FROM relation__user__follow__user follow
    WHERE follow.subject_id = recipients.user_id AND follow.object_id = $8 AND follow.deleted_at IS NULL
  )) OR ($10 = 'mutual_followers' AND EXISTS (
    SELECT 1 FROM relation__user__follow__user viewer_follow
    WHERE viewer_follow.subject_id = recipients.user_id AND viewer_follow.object_id = $8 AND viewer_follow.deleted_at IS NULL
  ) AND EXISTS (
    SELECT 1 FROM relation__user__follow__user creator_follow
    WHERE creator_follow.subject_id = $8 AND creator_follow.object_id = recipients.user_id AND creator_follow.deleted_at IS NULL
  ))) AND ($9 = 'public' OR $10 = 'users' OR ($10 = 'followers' AND EXISTS (
    SELECT 1 FROM relation__user__follow__user direct_access_follow
    WHERE direct_access_follow.subject_id = recipients.user_id AND direct_access_follow.object_id = $8 AND direct_access_follow.deleted_at IS NULL
  )) OR ($10 = 'mutual_followers' AND EXISTS (
    SELECT 1 FROM relation__user__follow__user direct_access_viewer_follow
    WHERE direct_access_viewer_follow.subject_id = recipients.user_id AND direct_access_viewer_follow.object_id = $8 AND direct_access_viewer_follow.deleted_at IS NULL
  ) AND EXISTS (
    SELECT 1 FROM relation__user__follow__user direct_access_creator_follow
    WHERE direct_access_creator_follow.subject_id = $8 AND direct_access_creator_follow.object_id = recipients.user_id AND direct_access_creator_follow.deleted_at IS NULL
  )))))`
