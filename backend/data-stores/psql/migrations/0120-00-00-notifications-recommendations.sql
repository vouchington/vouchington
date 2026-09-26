-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added user_warning entity type and user_warning_id column
-- edited-in-place: added direct_message and modmail notification entity types and conversation_id FK
-- edited-in-place: added moderation_appeal_id and community_ban_id columns (FK wired in 0450-00-00)
-- edited-in-place: added critical_moderation_alert entity type
-- Merged from: 0180-00-00-notifications-and-recommendations.sql

-- ==========================================================================
-- 0180-00-00-notifications-and-recommendations.sql
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_entity_types') THEN
    CREATE TYPE notification_entity_types AS ENUM ('post', 'rss_feed_item', 'follow', 'referral_signup', 'referral_click', 'moderation_report', 'review_dispute', 'user_warning', 'moderation_appeal', 'community_ban', 'direct_message', 'modmail', 'critical_moderation_alert', 'community_application_decision', 'community_role_change', 'community_ownership_transfer', 'community_activity_digest', 'copyright_notice');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_delivery_types') THEN
    CREATE TYPE notification_delivery_types AS ENUM ('subscription', 'manual_send');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_delete_reasons') THEN
    CREATE TYPE notification_delete_reasons AS ENUM ('system_pruned', 'user_deleted');
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE post_topic_recommendation_topic_types AS ENUM ('topic', 'referral_program', 'card');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  PRIMARY KEY (user_id, id),

  entity_type notification_entity_types NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  rss_feed_item_id UUID REFERENCES rss_feed_items(id) ON DELETE SET NULL,
  publication_post_id UUID,
  publication_rss_feed_item_id UUID,
  copyright_notice_id uuid,
  CONSTRAINT notifications_copyright_notice_entity_shape CHECK (
    (entity_type = 'copyright_notice'
      AND copyright_notice_id IS NOT NULL
      AND post_id IS NULL AND rss_feed_item_id IS NULL AND actor_user_id IS NULL
      AND moderation_report_id IS NULL AND review_dispute_id IS NULL AND user_warning_id IS NULL
      AND moderation_appeal_id IS NULL AND community_ban_id IS NULL AND conversation_id IS NULL
      AND community_id IS NULL)
    OR (entity_type <> 'copyright_notice' AND copyright_notice_id IS NULL)
  ),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  moderation_report_id UUID,
  review_dispute_id uuid,
  user_warning_id uuid,
  -- guardrails-disable-next-line uuid-must-be-key
  moderation_appeal_id uuid,
  -- guardrails-disable-next-line uuid-must-be-key
  community_ban_id uuid,
  conversation_id UUID REFERENCES conversations ON DELETE CASCADE,
  community_id UUID,
  event_key TEXT,
  CONSTRAINT chk_notifications__entity_columns
    CHECK (
      (
        entity_type = 'post'
        AND post_id IS NOT NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type = 'rss_feed_item'
        AND post_id IS NULL
        AND rss_feed_item_id IS NOT NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type IN ('follow', 'referral_signup')
        AND actor_user_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type = 'moderation_report'
        AND moderation_report_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type = 'review_dispute'
        AND review_dispute_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type = 'user_warning'
        AND user_warning_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type = 'moderation_appeal'
        AND moderation_appeal_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type = 'community_ban'
        AND community_ban_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        entity_type IN ('direct_message', 'modmail')
        AND conversation_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type = 'critical_moderation_alert'
        AND moderation_report_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
      OR (
        post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
        AND conversation_id IS NULL
      )
    ),
  delivery_type notification_delivery_types NOT NULL DEFAULT 'subscription',
  sent_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_notifications__delivery_sender
    CHECK (
      (delivery_type = 'subscription' AND sent_by_user_id IS NULL)
      OR (delivery_type = 'manual_send' AND sent_by_user_id IS NOT NULL)
    ),

  title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 300),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  actor_label TEXT CHECK (actor_label IS NULL OR length(actor_label) <= 100),
  target_path TEXT CHECK (target_path IS NULL OR length(target_path) > 0),
  target_entity JSONB,
  target_intent TEXT,
  CONSTRAINT chk_notifications__target
    CHECK (
      num_nonnulls(target_path, target_entity, target_intent) = 1
    ),
  CONSTRAINT chk_notifications__structured_target
    CHECK (
      (target_entity IS NULL OR (
        jsonb_typeof(target_entity) = 'object'
        AND target_entity ? '__entity_type'
        AND target_entity ? 'id'
      ))
      AND (target_intent IS NULL OR target_intent = 'notifications_inbox')
    ),
  CONSTRAINT chk_notifications__community_event_shape
    CHECK (
      entity_type NOT IN (
        'community_application_decision',
        'community_role_change',
        'community_ownership_transfer',
        'community_activity_digest'
      )
      OR (
        event_key IS NOT NULL
        AND target_path IS NULL
        AND (
          (
            entity_type IN (
              'community_application_decision',
              'community_role_change',
              'community_ownership_transfer'
            )
            AND community_id IS NOT NULL
            AND target_entity = jsonb_build_object('__entity_type', 'community', 'id', community_id)
            AND target_intent IS NULL
          )
          OR (
            entity_type = 'community_activity_digest'
            AND community_id IS NULL
            AND target_entity IS NULL
            AND target_intent = 'notifications_inbox'
          )
        )
      )
    ),

  read_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  delete_reason notification_delete_reasons,
  CONSTRAINT chk_notifications__delete_reason
    CHECK (
      (deleted_at IS NULL AND delete_reason IS NULL)
      OR (deleted_at IS NOT NULL AND delete_reason IS NOT NULL)
    ),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (user_id);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_event_key_check;
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS chk_notifications__event_key;
ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications__event_key
  CHECK (event_key IS NULL OR length(event_key) BETWEEN 1 AND 300)
  NOT VALID;
ALTER TABLE notifications
  VALIDATE CONSTRAINT chk_notifications__event_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__event_key
ON notifications (user_id, event_key)
WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__actor_user_id
ON notifications (actor_user_id)
WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__community_ban_id
ON notifications (community_ban_id)
WHERE community_ban_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__moderation_appeal_id
ON notifications (moderation_appeal_id)
WHERE moderation_appeal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__moderation_report_id
ON notifications (moderation_report_id)
WHERE moderation_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__post_id__fk
ON notifications (post_id)
WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__review_dispute_id
ON notifications (review_dispute_id)
WHERE review_dispute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__rss_feed_item_id
ON notifications (rss_feed_item_id)
WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__sent_by_user_id
ON notifications (sent_by_user_id)
WHERE sent_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__user_warning_id__fk
ON notifications (user_warning_id)
WHERE user_warning_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_activity_digest_dispatch_windows (
  window_start TIMESTAMPTZ PRIMARY KEY,
  window_end TIMESTAMPTZ NOT NULL,
  enqueued_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (window_end = window_start + INTERVAL '7 days')
);

CREATE OR REPLACE TRIGGER trigger_community_activity_digest_dispatch_windows_updated_at
BEFORE UPDATE ON community_activity_digest_dispatch_windows
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE community_activity_digest_dispatch_windows IS 'Durable weekly cursor and queue-enqueue state for community activity digest dispatch.';
COMMENT ON COLUMN community_activity_digest_dispatch_windows.window_start IS 'Inclusive UTC start of the closed weekly digest window.';
COMMENT ON COLUMN community_activity_digest_dispatch_windows.window_end IS 'Exclusive UTC end of the closed weekly digest window.';
COMMENT ON COLUMN community_activity_digest_dispatch_windows.enqueued_at IS 'Latest dispatch acceptance or batch activity time; stale incomplete windows are retryable.';
COMMENT ON COLUMN community_activity_digest_dispatch_windows.completed_at IS 'Time every recipient batch for the window completed; incomplete stale enqueues are eligible for replay.';
COMMENT ON COLUMN community_activity_digest_dispatch_windows.updated_at IS 'Time this dispatch-window state was last updated.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__post_id
ON notifications (user_id, post_id)
WHERE post_id IS NOT NULL
  AND deleted_at IS NULL
  AND delivery_type = 'subscription';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__rss_feed_item
ON notifications (user_id, rss_feed_item_id)
WHERE rss_feed_item_id IS NOT NULL
  AND deleted_at IS NULL
  AND delivery_type = 'subscription';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__actor_follow
ON notifications (user_id, actor_user_id)
WHERE entity_type = 'follow'
  AND deleted_at IS NULL
  AND delivery_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_notifications__user_id__id_desc
ON notifications (user_id, id DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__user_id__unread
ON notifications (user_id, id DESC)
WHERE deleted_at IS NULL AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__post_id
ON notifications (post_id)
WHERE post_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__rss_feed_item
ON notifications (rss_feed_item_id)
WHERE rss_feed_item_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__user_warning
ON notifications (user_id, user_warning_id)
WHERE user_warning_id IS NOT NULL
  AND deleted_at IS NULL
  AND delivery_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_notifications__user_warning_id
ON notifications (user_warning_id)
WHERE user_warning_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_conversation_type
ON notifications (user_id, conversation_id, entity_type)
WHERE conversation_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications__conversation_id
ON notifications (conversation_id)
WHERE conversation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__critical_moderation_alert
ON notifications (user_id, moderation_report_id)
WHERE entity_type = 'critical_moderation_alert'
  AND moderation_report_id IS NOT NULL
  AND deleted_at IS NULL
  AND delivery_type = 'subscription';

CREATE OR REPLACE TRIGGER trigger_notifications_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE notifications IS 'User notifications for posts and RSS feed items, range-partitioned by user UUIDv7.';
COMMENT ON COLUMN notifications.user_id IS 'The user receiving this notification; also the partition key.';
COMMENT ON COLUMN notifications.entity_type IS 'The type of entity this notification is about: post, rss_feed_item, follow, referral_signup, moderation_report, review_dispute, or user_warning.';
COMMENT ON COLUMN notifications.post_id IS 'The post this notification refers to; set when entity_type is post.';
COMMENT ON COLUMN notifications.rss_feed_item_id IS 'The RSS feed item this notification refers to; set when entity_type is rss_feed_item.';
COMMENT ON COLUMN notifications.actor_user_id IS 'The user who performed the action triggering this notification. For follow: the follower. For referral_signup: the newly signed-up user (not the referrer). Required for follow and referral_signup types.';
COMMENT ON COLUMN notifications.delivery_type IS 'How the notification was triggered: subscription (automatic) or manual_send.';
COMMENT ON COLUMN notifications.sent_by_user_id IS 'The user who manually sent this notification; set when delivery_type is manual_send.';
COMMENT ON COLUMN notifications.title IS 'Notification title text.';
COMMENT ON COLUMN notifications.body IS 'Notification body text.';
COMMENT ON COLUMN notifications.actor_label IS 'Optional display label for the actor who triggered the notification.';
COMMENT ON COLUMN notifications.target_path IS 'URL path the notification links to.';
COMMENT ON COLUMN notifications.target_entity IS 'Structured entity navigation target; preferred over the legacy target_path.';
COMMENT ON COLUMN notifications.target_intent IS 'Structured application navigation intent; preferred over the legacy target_path.';
COMMENT ON COLUMN notifications.event_key IS 'Stable producer-defined idempotency key, unique per recipient even after dismissal.';
COMMENT ON COLUMN notifications.read_at IS 'When the user read this notification.';
COMMENT ON COLUMN notifications.pushed_at IS 'When a push notification was sent for this notification.';
COMMENT ON COLUMN notifications.delete_reason IS 'Why this notification was deleted: system_pruned or user_deleted.';
COMMENT ON COLUMN notifications.review_dispute_id IS 'The review dispute this notification refers to; set when entity_type is review_dispute.';
COMMENT ON COLUMN notifications.user_warning_id IS 'The user warning this notification refers to; set when entity_type is user_warning.';
COMMENT ON COLUMN notifications.conversation_id IS 'The conversation this notification refers to; set when entity_type is direct_message or modmail.';

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  PRIMARY KEY (user_id, id),

  endpoint TEXT NOT NULL CHECK (endpoint LIKE 'https://%'),
  p256dh TEXT NOT NULL CHECK (length(p256dh) BETWEEN 16 AND 512),
  auth TEXT NOT NULL CHECK (length(auth) BETWEEN 8 AND 512),
  expiration_time_ms BIGINT,
  user_agent TEXT NOT NULL DEFAULT '',

  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_push_subs__user_id__endpoint
ON web_push_subscriptions (user_id, endpoint)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_web_push_subs__user_id__id_desc
ON web_push_subscriptions (user_id, id DESC)
WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER trigger_web_push_subscriptions_updated_at
BEFORE UPDATE ON web_push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE web_push_subscriptions IS 'Web Push API subscriptions for delivering browser push notifications, range-partitioned by user UUIDv7.';
COMMENT ON COLUMN web_push_subscriptions.user_id IS 'The user who registered this push subscription; also the partition key.';
COMMENT ON COLUMN web_push_subscriptions.endpoint IS 'The push service endpoint URL (must be HTTPS).';
COMMENT ON COLUMN web_push_subscriptions.p256dh IS 'Client public key for push message encryption (P-256 ECDH).';
COMMENT ON COLUMN web_push_subscriptions.auth IS 'Authentication secret for push message encryption.';
COMMENT ON COLUMN web_push_subscriptions.expiration_time_ms IS 'Subscription expiration time in milliseconds, if provided by the browser.';
COMMENT ON COLUMN web_push_subscriptions.user_agent IS 'Browser user-agent string at the time of subscription.';
COMMENT ON COLUMN web_push_subscriptions.last_success_at IS 'When a push was last successfully delivered to this subscription.';
COMMENT ON COLUMN web_push_subscriptions.last_failure_at IS 'When a push last failed to deliver to this subscription.';

CREATE TABLE IF NOT EXISTS post_topic_recommendations (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  topic_title TEXT NOT NULL,
  topic_slug TEXT NOT NULL,
  topic_markdown TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  hostname_id UUID REFERENCES url_hostnames(id) ON DELETE SET NULL,
  topic_type post_topic_recommendation_topic_types NOT NULL DEFAULT 'topic',
  example_referral_link TEXT,
  landing_page_urls TEXT[] NOT NULL DEFAULT '{}',
  approval_error_message TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id),
  CHECK (topic_title = TRIM(topic_title)),
  CHECK (topic_slug = LOWER(topic_slug)),
  CHECK (topic_slug = TRIM(topic_slug)),
  CHECK (char_length(TRIM(topic_title)) > 0),
  CHECK (char_length(topic_slug) > 0),
  CHECK (topic_markdown IS NULL OR topic_markdown = TRIM(topic_markdown)),
  CHECK (example_referral_link IS NULL OR example_referral_link = TRIM(example_referral_link)),
  CHECK (
    approval_error_message IS NULL
    OR approval_error_message = TRIM(approval_error_message)
  ),
  CHECK (rejection_reason IS NULL OR rejection_reason = TRIM(rejection_reason)),
  CHECK (
    (
      reviewed_at IS NULL
      AND reviewed_by_id IS NULL
      AND rejection_reason IS NULL
      AND created_topic_id IS NULL
    )
    OR (
      reviewed_at IS NOT NULL
      AND reviewed_by_id IS NOT NULL
      AND rejection_reason IS NULL
      AND created_topic_id IS NOT NULL
    )
    OR (
      reviewed_at IS NOT NULL
      AND reviewed_by_id IS NOT NULL
      AND created_topic_id IS NULL
      AND (
        rejection_reason IS NULL
        OR char_length(TRIM(rejection_reason)) > 0
      )
    )
  )
) PARTITION BY RANGE (post_id);

CREATE TABLE IF NOT EXISTS post_topic_recommendations_hostnames (
  post_id UUID NOT NULL REFERENCES post_topic_recommendations(post_id) ON DELETE CASCADE,
  hostname_id UUID NOT NULL REFERENCES url_hostnames(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, hostname_id)
);

CREATE OR REPLACE TRIGGER trigger_post_topic_recommendations_updated_at
BEFORE UPDATE ON post_topic_recommendations
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_post_topic_recommendations_hostnames_updated_at
BEFORE UPDATE ON post_topic_recommendations_hostnames
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_topic_recommendations__reviewed_by_id
ON post_topic_recommendations (reviewed_by_id, post_id DESC)
WHERE reviewed_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_post_topic_recommendations__created_topic_id
ON post_topic_recommendations (created_topic_id)
WHERE created_topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_post_topic_recommendations__hostname_id
ON post_topic_recommendations (hostname_id)
WHERE hostname_id IS NOT NULL;

COMMENT ON TABLE post_topic_recommendations IS 'User- and admin-created topic recommendations attached to posts, pending admin review. Range-partitioned by post_id.';
COMMENT ON COLUMN post_topic_recommendations.post_id IS 'The post this topic recommendation is attached to (also primary key and partition key).';
COMMENT ON COLUMN post_topic_recommendations.topic_title IS 'Proposed display name for the new topic.';
COMMENT ON COLUMN post_topic_recommendations.topic_slug IS 'Proposed URL slug for the new topic.';
COMMENT ON COLUMN post_topic_recommendations.topic_markdown IS 'Optional markdown description for the proposed topic.';
COMMENT ON COLUMN post_topic_recommendations.aliases IS 'Alternative names or aliases for the proposed topic.';
COMMENT ON COLUMN post_topic_recommendations.hostname_id IS 'Primary hostname associated with this topic recommendation.';
COMMENT ON COLUMN post_topic_recommendations.approval_error_message IS 'Error message if automatic approval failed.';
COMMENT ON COLUMN post_topic_recommendations.reviewed_at IS 'When an admin reviewed this recommendation.';
COMMENT ON COLUMN post_topic_recommendations.reviewed_by_id IS 'The admin who reviewed this recommendation.';
COMMENT ON COLUMN post_topic_recommendations.rejection_reason IS 'Reason provided when rejecting the recommendation.';
COMMENT ON COLUMN post_topic_recommendations.created_topic_id IS 'The topic created from this recommendation upon approval.';
COMMENT ON COLUMN post_topic_recommendations.topic_type IS 'The proposed topic type: topic (generic), referral_program, or card.';
COMMENT ON COLUMN post_topic_recommendations.example_referral_link IS 'For referral_program recommendations: an example referral URL submitted by the user.';
COMMENT ON COLUMN post_topic_recommendations.landing_page_urls IS 'For card recommendations: one or more landing-page URLs submitted by the user.';

CREATE INDEX IF NOT EXISTS idx_post_topic_recommendations_hostnames__hostname_id
ON post_topic_recommendations_hostnames (hostname_id, post_id DESC);

COMMENT ON TABLE post_topic_recommendations_hostnames IS 'Additional hostnames associated with a post topic recommendation.';
COMMENT ON COLUMN post_topic_recommendations_hostnames.post_id IS 'The topic recommendation this hostname is associated with.';
COMMENT ON COLUMN post_topic_recommendations_hostnames.hostname_id IS 'An additional hostname relevant to this topic recommendation.';

CREATE TABLE IF NOT EXISTS post_feed_shares (
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  PRIMARY KEY (recipient_user_id, id),

  shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  sort_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_post_feed_shares__recipient__sort
ON post_feed_shares (recipient_user_id, sort_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_post_feed_shares__post_id
ON post_feed_shares (post_id);

CREATE OR REPLACE TRIGGER trigger_post_feed_shares_updated_at
BEFORE UPDATE ON post_feed_shares
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_feed_shares IS 'Records of posts shared to another user''s feed, range-partitioned by recipient UUIDv7.';
COMMENT ON COLUMN post_feed_shares.recipient_user_id IS 'The user who receives this shared post in their feed; also the partition key.';
COMMENT ON COLUMN post_feed_shares.shared_by_user_id IS 'The user who shared the post.';
COMMENT ON COLUMN post_feed_shares.post_id IS 'The post being shared.';
COMMENT ON COLUMN post_feed_shares.sort_at IS 'Timestamp used for sorting this share in the recipient''s feed.';

CREATE TABLE IF NOT EXISTS rss_feed_item_feed_shares (
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  PRIMARY KEY (recipient_user_id, id),

  shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items ON DELETE CASCADE,
  sort_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_rss_item_feed_shares__recipient__sort
ON rss_feed_item_feed_shares (recipient_user_id, sort_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_rss_item_feed_shares__item
ON rss_feed_item_feed_shares (rss_feed_item_id);

CREATE OR REPLACE TRIGGER trigger_rss_feed_item_feed_shares_updated_at
BEFORE UPDATE ON rss_feed_item_feed_shares
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE rss_feed_item_feed_shares IS 'Records of RSS feed items shared to another user''s feed, range-partitioned by recipient UUIDv7.';
COMMENT ON COLUMN rss_feed_item_feed_shares.recipient_user_id IS 'The user who receives this shared item in their feed; also the partition key.';
COMMENT ON COLUMN rss_feed_item_feed_shares.shared_by_user_id IS 'The user who shared the RSS feed item.';
COMMENT ON COLUMN rss_feed_item_feed_shares.rss_feed_item_id IS 'The RSS feed item that was shared.';
COMMENT ON COLUMN rss_feed_item_feed_shares.sort_at IS 'Timestamp used for sorting this share in the recipient''s feed.';
