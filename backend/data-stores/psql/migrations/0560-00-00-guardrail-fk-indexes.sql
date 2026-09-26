-- migration-mode: online
-- RI-usable indexes for pre-existing foreign keys from #7427.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys__user_id__fk
  ON api_keys (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_bans__community_id
  ON community_bans (community_id)
  WHERE community_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_bans__user_id
  ON community_bans (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_member_vacations__user_id
  ON community_member_vacations (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations__deleted_by_id
  ON conversations (deleted_by_id)
  WHERE deleted_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations__resolved_by_id
  ON conversations (resolved_by_id)
  WHERE resolved_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations__subject_user_id
  ON conversations (subject_user_id)
  WHERE subject_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations__updated_by_id
  ON conversations (updated_by_id)
  WHERE updated_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crawlers__created_by_id
  ON crawlers (created_by_id)
  WHERE created_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_images__created_by_id
  ON images (created_by_id)
  WHERE created_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_individual_cards__authorized_user_of_id
  ON individual_cards (authorized_user_of_id)
  WHERE authorized_user_of_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_list_items__posts__list_id__fk
  ON list_items__posts (list_id)
  WHERE list_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_list_items__posts__post_id__fk
  ON list_items__posts (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_list_items__rss_feed_items__list_id__fk
  ON list_items__rss_feed_items (list_id)
  WHERE list_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_list_items__rss_feed_items__rss_feed_item_id__fk
  ON list_items__rss_feed_items (rss_feed_item_id)
  WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lists__owner_user_id__fk
  ON lists (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships__user_id
  ON memberships (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_media_reveals__post_id
  ON moderation_media_reveals (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_media_reveals__report_id
  ON moderation_media_reveals (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_queue_claims__claimed_by_id
  ON moderation_queue_claims (claimed_by_id)
  WHERE claimed_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_queue_claims__post_id
  ON moderation_queue_claims (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_queue_claims__report_id
  ON moderation_queue_claims (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_report_judgements__triggering_report_id
  ON moderation_report_judgements (triggering_report_id)
  WHERE triggering_report_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_reports__reporter_user_id
  ON moderation_reports (reporter_user_id)
  WHERE reporter_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_training_feedbacks__actor_user_id
  ON moderation_training_feedbacks (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_training_feedbacks__moderation_report_id
  ON moderation_training_feedbacks (moderation_report_id)
  WHERE moderation_report_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_training_feedbacks__post_clearance_change_id
  ON moderation_training_feedbacks (post_clearance_change_id)
  WHERE post_clearance_change_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_training_feedbacks__review_dispute_id
  ON moderation_training_feedbacks (review_dispute_id)
  WHERE review_dispute_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderator_actions__community_application_id
  ON moderator_actions (community_application_id)
  WHERE community_application_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderator_actions__post_id
  ON moderator_actions (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderator_actions__report_id
  ON moderator_actions (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderator_actions__review_dispute_id
  ON moderator_actions (review_dispute_id)
  WHERE review_dispute_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderator_actions__target_user_id
  ON moderator_actions (target_user_id)
  WHERE target_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post__stories__initiated_by_id
  ON post__stories (initiated_by_id)
  WHERE initiated_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_dispute_annotations__post_id
  ON post_dispute_annotations (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_dispute_annotations__review_dispute_id
  ON post_dispute_annotations (review_dispute_id)
  WHERE review_dispute_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_locks__post_id
  ON post_locks (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_report_abuse_penalties__user_id
  ON report_abuse_penalties (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retailer_countries__country_id
  ON retailer_countries (country_id)
  WHERE country_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_url_hostname_blocks__url_hostname_id
  ON url_hostname_blocks (url_hostname_id)
  WHERE url_hostname_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_urls__canonical_url_id
  ON urls (canonical_url_id)
  WHERE canonical_url_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_urls__url_content_type_id
  ON urls (url_content_type_id)
  WHERE url_content_type_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_consents__user_id__fk
  ON user_consents (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_import_requests__rss_feed_id
  ON user_import_requests (rss_feed_id)
  WHERE rss_feed_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_import_requests__topic_id
  ON user_import_requests (topic_id)
  WHERE topic_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_import_requests__topic_recommendation_post_id
  ON user_import_requests (topic_recommendation_post_id)
  WHERE topic_recommendation_post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_landing_page_group_members__referral_link_id
  ON user_landing_page_group_members (referral_link_id)
  WHERE referral_link_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_landing_page_group_members__review_id
  ON user_landing_page_group_members (review_id)
  WHERE review_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_landing_page_items__profile_link_id
  ON user_landing_page_items (profile_link_id)
  WHERE profile_link_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_landing_page_items__referral_link_id
  ON user_landing_page_items (referral_link_id)
  WHERE referral_link_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_landing_page_items__review_id
  ON user_landing_page_items (review_id)
  WHERE review_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_landing_page_items__topic_id
  ON user_landing_page_items (topic_id)
  WHERE topic_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_mod_notes__target_user_id
  ON user_mod_notes (target_user_id)
  WHERE target_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_permissions__permission_type_id
  ON user_permissions (permission_type_id)
  WHERE permission_type_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_profile_links__image_id
  ON user_profile_links (image_id)
  WHERE image_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_referral_program_links__referral_program_id__fk
  ON user_referral_program_links (referral_program_id)
  WHERE referral_program_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_referral_program_links__url_id__fk
  ON user_referral_program_links (url_id)
  WHERE url_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_referral_program_links__user_id__fk
  ON user_referral_program_links (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_role_permissions__permission_type_id
  ON user_role_permissions (permission_type_id)
  WHERE permission_type_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_rss_feed_import_rows__rss_feed_id
  ON user_rss_feed_import_rows (rss_feed_id)
  WHERE rss_feed_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_suspensions__user_id
  ON user_suspensions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_verified_identities__transferred_to_user_id
  ON verified_identities (transferred_to_user_id)
  WHERE transferred_to_user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_verified_identities__user_id
  ON verified_identities (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vote_integrity_flags__agent_moderation_post_id
  ON vote_integrity_flags (agent_moderation_post_id)
  WHERE agent_moderation_post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vote_weight_penalties__created_by_id
  ON vote_weight_penalties (created_by_id)
  WHERE created_by_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vote_weight_penalties__user_id
  ON vote_weight_penalties (user_id)
  WHERE user_id IS NOT NULL;
