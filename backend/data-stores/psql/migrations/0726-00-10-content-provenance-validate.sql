-- VALIDATE takes SHARE UPDATE EXCLUSIVE, so reads and writes continue while each table is scanned.
ALTER TABLE communities
  VALIDATE CONSTRAINT communities_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT communities_created_via_oauth_client_id_check;

ALTER TABLE topics
  VALIDATE CONSTRAINT topics_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT topics_created_via_oauth_client_id_check;

ALTER TABLE lists
  VALIDATE CONSTRAINT lists_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT lists_created_via_oauth_client_id_check;

ALTER TABLE rss_feeds
  VALIDATE CONSTRAINT rss_feeds_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT rss_feeds_created_via_oauth_client_id_check;

ALTER TABLE moderation_reports
  VALIDATE CONSTRAINT moderation_reports_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT moderation_reports_created_via_oauth_client_id_check;

ALTER TABLE moderation_appeals
  VALIDATE CONSTRAINT moderation_appeals_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT moderation_appeals_created_via_oauth_client_id_check;

ALTER TABLE community_applications
  VALIDATE CONSTRAINT community_applications_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT community_applications_created_via_oauth_client_id_check;

ALTER TABLE user_referral_program_links
  VALIDATE CONSTRAINT user_referral_program_links_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT user_referral_program_links_created_via_oauth_client_id_check;

ALTER TABLE posts
  VALIDATE CONSTRAINT posts_created_via_oauth_client_id_fkey,
  VALIDATE CONSTRAINT posts_created_via_oauth_client_id_check;
