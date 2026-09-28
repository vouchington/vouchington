DO $$ BEGIN
  CREATE TYPE follower_distribution_actions AS ENUM (
    'post_share',
    'post_send',
    'rss_feed_item_share',
    'rss_feed_item_send'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE follower_distribution_audiences AS ENUM ('all_followers', 'selected_followers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS follower_distributions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action follower_distribution_actions NOT NULL,
  audience follower_distribution_audiences NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  last_processed_recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT CHECK (failure_reason IS NULL OR length(failure_reason) <= 1000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_follower_distributions__entity
    CHECK (
      (
        action IN ('post_share', 'post_send')
        AND post_id IS NOT NULL
        AND rss_feed_item_id IS NULL
      )
      OR (
        action IN ('rss_feed_item_share', 'rss_feed_item_send')
        AND post_id IS NULL
        AND rss_feed_item_id IS NOT NULL
      )
    ),
  CONSTRAINT chk_follower_distributions__terminal_state
    CHECK (completed_at IS NULL OR failed_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_follower_distributions__sender_action_post
ON follower_distributions (sender_user_id, action, post_id, id DESC)
WHERE post_id IS NOT NULL AND failed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_follower_distributions__sender_action_rss
ON follower_distributions (sender_user_id, action, rss_feed_item_id, id DESC)
WHERE rss_feed_item_id IS NOT NULL AND failed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_follower_distributions__incomplete
ON follower_distributions (id)
WHERE completed_at IS NULL AND failed_at IS NULL;

-- RI-usable indexes for FKs not led by any index above
CREATE INDEX IF NOT EXISTS idx_follower_distributions__sender_user_id
ON follower_distributions (sender_user_id);

CREATE INDEX IF NOT EXISTS idx_follower_distributions__post_id
ON follower_distributions (post_id)
WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_follower_distributions__rss_feed_item_id
ON follower_distributions (rss_feed_item_id)
WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_follower_distributions__last_processed_recipient_user_id
ON follower_distributions (last_processed_recipient_user_id)
WHERE last_processed_recipient_user_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trigger_follower_distributions_updated_at
BEFORE UPDATE ON follower_distributions
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS follower_distribution_deliveries (
  distribution_id UUID NOT NULL REFERENCES follower_distributions(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(delivery_id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (distribution_id, recipient_user_id),
  UNIQUE (recipient_user_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_follower_distribution_deliveries__delivery
ON follower_distribution_deliveries (delivery_id);

CREATE OR REPLACE TRIGGER trigger_follower_distribution_deliveries_updated_at
BEFORE UPDATE ON follower_distribution_deliveries
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE follower_distributions IS 'Persisted manual follower share/send distribution intents processed by queued chunk workers.';
COMMENT ON COLUMN follower_distributions.sender_user_id IS 'User who requested the distribution.';
COMMENT ON COLUMN follower_distributions.action IS 'Manual follower distribution action: post/rss share or send.';
COMMENT ON COLUMN follower_distributions.audience IS 'Whether the distribution targets all followers or a selected subset.';
COMMENT ON COLUMN follower_distributions.post_id IS 'Post target for post share/send distributions.';
COMMENT ON COLUMN follower_distributions.rss_feed_item_id IS 'RSS feed item target for RSS share/send distributions.';
COMMENT ON COLUMN follower_distributions.last_processed_recipient_user_id IS 'Keyset cursor for chunk continuation.';
COMMENT ON COLUMN follower_distributions.completed_at IS 'When all intended recipients have been processed.';
COMMENT ON COLUMN follower_distributions.failed_at IS 'When processing stopped because the distribution target became invalid.';
COMMENT ON COLUMN follower_distributions.failure_reason IS 'Human-readable failure reason for stopped distributions.';
COMMENT ON TABLE follower_distribution_deliveries IS 'Per-recipient delivery ids for idempotent distribution chunk retries.';
COMMENT ON COLUMN follower_distribution_deliveries.distribution_id IS 'Distribution intent this delivery belongs to.';
COMMENT ON COLUMN follower_distribution_deliveries.recipient_user_id IS 'Follower receiving the distribution delivery.';
COMMENT ON COLUMN follower_distribution_deliveries.delivery_id IS 'Stable id reused for the final feed share or notification row.';

CREATE TABLE IF NOT EXISTS follower_distribution_selected_recipients (
  distribution_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL,
  PRIMARY KEY (distribution_id, recipient_user_id),
  CONSTRAINT fk_fd_selected_recipients__distribution
    FOREIGN KEY (distribution_id) REFERENCES follower_distributions(id) ON DELETE CASCADE,
  CONSTRAINT fk_fd_selected_recipients__user
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fd_selected_recipients__recipient_user_id
ON follower_distribution_selected_recipients (recipient_user_id);

COMMENT ON TABLE follower_distribution_selected_recipients IS 'Distribution-owned selected recipient snapshot. Delivery identity stays on follower_distribution_deliveries.';
COMMENT ON COLUMN follower_distribution_selected_recipients.distribution_id IS 'Selected-followers distribution that owns this recipient.';
COMMENT ON COLUMN follower_distribution_selected_recipients.recipient_user_id IS 'User selected at acceptance. Later unfollows do not remove the row; hard deletion does.';

CREATE OR REPLACE FUNCTION fn_assert_follower_distribution_recipient_bounds()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  distribution_ids UUID[] := ARRAY[]::UUID[];
  checked_distribution_id UUID;
  audience_value follower_distribution_audiences;
  recipient_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'follower_distributions' THEN
    distribution_ids := ARRAY[COALESCE(NEW.id, OLD.id)];
  ELSE
    distribution_ids := ARRAY[COALESCE(NEW.distribution_id, OLD.distribution_id)];
    IF TG_OP = 'UPDATE' AND OLD.distribution_id IS DISTINCT FROM NEW.distribution_id THEN
      distribution_ids := distribution_ids || OLD.distribution_id;
    END IF;
  END IF;

  FOREACH checked_distribution_id IN ARRAY distribution_ids LOOP
    SELECT audience INTO audience_value
    FROM follower_distributions
    WHERE id = checked_distribution_id;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO recipient_count
    FROM follower_distribution_selected_recipients
    WHERE follower_distribution_selected_recipients.distribution_id = checked_distribution_id;

    IF audience_value = 'all_followers' AND recipient_count <> 0 THEN
      RAISE EXCEPTION 'all_followers distributions cannot store selected recipients'
        USING ERRCODE = '23514';
    END IF;

    IF audience_value = 'selected_followers' AND recipient_count > 100 THEN
      RAISE EXCEPTION 'selected_followers distributions require between 1 and 100 recipients'
        USING ERRCODE = '23514';
    END IF;

    IF audience_value = 'selected_followers'
      AND recipient_count < 1
      AND NOT (
        TG_TABLE_NAME = 'follower_distribution_selected_recipients'
        AND TG_OP = 'DELETE'
      ) THEN
      RAISE EXCEPTION 'selected_followers distributions require between 1 and 100 recipients'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION fn_assert_follower_distribution_recipient_bounds() IS
  'Keeps selected-followers membership between 1 and 100 at acceptance and rejects selected rows on all-followers distributions. Recipient deletion may shrink the snapshot so user hard-deletion is not blocked.';

CREATE CONSTRAINT TRIGGER trigger_fd_distributions_recipient_bounds
AFTER INSERT OR UPDATE OF audience ON follower_distributions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_assert_follower_distribution_recipient_bounds();

CREATE CONSTRAINT TRIGGER trigger_fd_selected_recipients_bounds
AFTER INSERT OR UPDATE OR DELETE ON follower_distribution_selected_recipients
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_assert_follower_distribution_recipient_bounds();
