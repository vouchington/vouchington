-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: folded github oauth-retention-cleanup-indexes idempotent
-- Merged from: 0050-00-00-individuals-households.sql, 0090-00-00-user-profile-links.sql, 0150-00-00-find-friends-ses-bounce.sql, 0009-00-00-user-metrics.sql

-- ==========================================================================
-- 0050-00-00-individuals-households.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS individuals (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_individuals_fn_update_updated_at
  BEFORE UPDATE ON individuals
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE individuals IS 'Represents a real person. A user account maps to one individual for personal finance tracking.';

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  -- the person who owns this household
  owner_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_households_fn_update_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- Supports deterministic owned-household selection and cursor pagination.
CREATE INDEX IF NOT EXISTS idx_households__owner_updated_id
ON households (owner_id, updated_at DESC, id DESC);

COMMENT ON TABLE households IS 'A household owned by a user, grouping individuals for shared finance tracking.';
COMMENT ON COLUMN households.owner_id IS 'The user who owns and manages this household.';

CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  -- the household that the individual is a member of
  household_id UUID NOT NULL REFERENCES households ON DELETE CASCADE,

  -- the individual that is a member of the household
  individual_id UUID NOT NULL REFERENCES individuals ON DELETE CASCADE,

  relationship TEXT, -- e.g. husband, wife, child, etc.

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Unique constraint to prevent duplicate memberships
  CONSTRAINT uniq_household_members__household_id_individual_id
    UNIQUE (household_id, individual_id)
);

CREATE OR REPLACE TRIGGER trigger_household_members_fn_update_updated_at
  BEFORE UPDATE ON household_members
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- Supports deterministic household-membership cursor pagination.
CREATE INDEX IF NOT EXISTS idx_household_members__household_updated_id
ON household_members (household_id, updated_at DESC, id DESC);

-- Supports member-only household access checks without scanning unrelated memberships.
CREATE INDEX IF NOT EXISTS idx_household_members__individual_household
ON household_members (individual_id, household_id);

COMMENT ON TABLE household_members IS 'Join table linking individuals to households with a relationship descriptor.';
COMMENT ON COLUMN household_members.household_id IS 'The household this membership belongs to.';
COMMENT ON COLUMN household_members.individual_id IS 'The individual who is a member of the household.';
COMMENT ON COLUMN household_members.relationship IS 'Relationship to the household owner (e.g. husband, wife, child).';

CREATE TABLE IF NOT EXISTS individual_cards (
  -- an individual can have more than one of the same type of card
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  individual_id UUID NOT NULL REFERENCES individuals ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,

  opened_on DATE,
  closed_on DATE,
  credit_limit_minor_units BIGINT,
  CHECK (credit_limit_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  CHECK ((credit_limit_minor_units IS NULL) = (currency_code IS NULL)),
  received_sign_up_bonus_on DATE,

  -- set `is_authorized_user` to `true` if this card is an AU of another card
  is_authorized_user BOOLEAN DEFAULT FALSE,
  -- set `authorized_user_of_id` to the card that this card is an AU of
  authorized_user_of_id UUID REFERENCES individual_cards ON DELETE SET NULL,
  CHECK (NOT (authorized_user_of_id IS NOT NULL AND is_authorized_user IS FALSE)),

  note TEXT,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_individual_cards_fn_update_updated_at
  BEFORE UPDATE ON individual_cards
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- find a user's cards
CREATE INDEX IF NOT EXISTS individual_cards__individual_id
ON individual_cards (individual_id);

-- find a card's users
CREATE INDEX IF NOT EXISTS individual_cards__card_id
ON individual_cards (card_id);

CREATE INDEX IF NOT EXISTS individual_cards__currency_code
ON individual_cards (currency_code)
WHERE currency_code IS NOT NULL;

COMMENT ON TABLE individual_cards IS 'Credit/debit cards held by individuals. An individual can hold multiple cards of the same type.';
COMMENT ON COLUMN individual_cards.individual_id IS 'The individual who holds this card.';
COMMENT ON COLUMN individual_cards.card_id IS 'The card topic (references topics where topic_type = ''card'').';
COMMENT ON COLUMN individual_cards.opened_on IS 'Date the card account was opened.';
COMMENT ON COLUMN individual_cards.closed_on IS 'Date the card account was closed. NULL if still open.';
COMMENT ON COLUMN individual_cards.credit_limit_minor_units IS 'Credit limit in the currency minor unit.';
COMMENT ON COLUMN individual_cards.currency_code IS 'Currency for the credit limit.';
COMMENT ON COLUMN individual_cards.received_sign_up_bonus_on IS 'Date the sign-up bonus was received.';
COMMENT ON COLUMN individual_cards.is_authorized_user IS 'TRUE if this card is an authorized user card on another account.';
COMMENT ON COLUMN individual_cards.authorized_user_of_id IS 'The primary cardholder''s individual_cards row, if this is an AU.';
COMMENT ON COLUMN individual_cards.note IS 'Free-text note about this card.';

CREATE TABLE IF NOT EXISTS individual_rewards_program_statuses (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  individual_id UUID NOT NULL REFERENCES individuals ON DELETE CASCADE,
  rewards_program_status_id UUID NOT NULL REFERENCES topics__rewards_program_statuses ON DELETE CASCADE, -- e.g. Marriott Bonvoy Platinum Elite Status

  since DATE,
  until DATE,
  CHECK ((since IS NULL OR until IS NULL) OR since <= until),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_individual_rewards_program_statuses_updated_at
  BEFORE UPDATE ON individual_rewards_program_statuses
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- find a user's rewards program statuses
CREATE INDEX IF NOT EXISTS individual_rewards_program_statuses__individual_id
ON individual_rewards_program_statuses (individual_id);

-- find a rewards program status's users
CREATE INDEX IF NOT EXISTS individual_rewards_program_statuses__rewards_program_status_id
ON individual_rewards_program_statuses (rewards_program_status_id);

COMMENT ON TABLE individual_rewards_program_statuses IS 'Rewards program tier statuses held by individuals (e.g. Marriott Platinum Elite).';
COMMENT ON COLUMN individual_rewards_program_statuses.individual_id IS 'The individual who holds this status.';
COMMENT ON COLUMN individual_rewards_program_statuses.rewards_program_status_id IS 'The specific tier status (references topics__rewards_program_statuses).';
COMMENT ON COLUMN individual_rewards_program_statuses.since IS 'Date the status was earned or started.';
COMMENT ON COLUMN individual_rewards_program_statuses.until IS 'Date the status expires. NULL if ongoing.';

CREATE TABLE IF NOT EXISTS spending_entries (
  -- an individual or household can have more than one entry for the same spending category
  -- e.g. want to split Amazon purchases between the types of purchases (recurring, one-time, discretionary, etc.)
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  -- exactly one of household_id or individual_id must be set
  household_id UUID REFERENCES households ON DELETE CASCADE,
  individual_id UUID REFERENCES individuals ON DELETE CASCADE,
  CHECK (NOT (household_id IS NOT NULL AND individual_id IS NOT NULL)), -- only one can be set
  CHECK (NOT (household_id IS NULL AND individual_id IS NULL)), -- at least one must be set
  spending_category_id UUID NOT NULL REFERENCES topics__spending_categories ON DELETE CASCADE,

  spending_frequency spending_frequencies NOT NULL DEFAULT 'monthly',
  amount_minor_units BIGINT NOT NULL,
  CHECK (amount_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,

  note TEXT,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- find a household's spending categories
CREATE INDEX IF NOT EXISTS spending_entries__household_id
ON spending_entries (household_id);

-- find a user's spending categories
CREATE INDEX IF NOT EXISTS spending_entries__individual_id
ON spending_entries (individual_id)
WHERE individual_id IS NOT NULL;

-- calculate metrics for a spending category
CREATE INDEX IF NOT EXISTS spending_entries__spending_category_id
ON spending_entries (spending_category_id);

-- Index for foreign key on currency
CREATE INDEX IF NOT EXISTS idx_spending_entries__currency_code
ON spending_entries (currency_code);

CREATE OR REPLACE TRIGGER trigger_spending_entries_fn_update_updated_at
  BEFORE UPDATE ON spending_entries
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE spending_entries IS 'Spending amounts per category, associated with either a household or individual.';
COMMENT ON COLUMN spending_entries.household_id IS 'The household this spending is for. Mutually exclusive with individual_id.';
COMMENT ON COLUMN spending_entries.individual_id IS 'The individual this spending is for. Mutually exclusive with household_id.';
COMMENT ON COLUMN spending_entries.spending_category_id IS 'The spending category (references topics__spending_categories).';
COMMENT ON COLUMN spending_entries.spending_frequency IS 'How often this spending occurs (monthly or annually).';
COMMENT ON COLUMN spending_entries.amount_minor_units IS 'Spending amount per frequency period in the currency minor unit.';
COMMENT ON COLUMN spending_entries.currency_code IS 'Currency of the spending amount.';
COMMENT ON COLUMN spending_entries.note IS 'Free-text note about this spending entry.';

-- Add FK from users.individual_id to individuals (column defined in 0010)
ALTER TABLE users
  ADD CONSTRAINT fk_users_individual_id FOREIGN KEY (individual_id) REFERENCES individuals (id) ON DELETE SET NULL NOT VALID;

ALTER TABLE users VALIDATE CONSTRAINT fk_users_individual_id;

-- unique index on individual_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_users__individual_id
ON users (individual_id)
WHERE individual_id IS NOT NULL;

COMMENT ON COLUMN users.individual_id IS 'The real-person individual linked to this user account for personal finance tracking.';

-- Create a trigger function that automatically creates individual, household, and membership for new users
CREATE OR REPLACE FUNCTION fn_create_user_individual_household()
RETURNS TRIGGER AS $$
DECLARE
  new_individual_id UUID;
  new_household_id UUID;
BEGIN
  -- Create individual
  INSERT INTO individuals DEFAULT VALUES
  RETURNING id INTO new_individual_id;

  -- Link individual to user
  UPDATE users
  SET individual_id = new_individual_id
  WHERE id = NEW.id;

  -- Create household owned by user
  INSERT INTO households (owner_id)
  VALUES (NEW.id)
  RETURNING id INTO new_household_id;

  -- Create membership linking individual to household
  INSERT INTO household_members (household_id, individual_id)
  VALUES (new_household_id, new_individual_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that runs after user creation
CREATE TRIGGER trigger_users_create_individual_household
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_user_individual_household();

CREATE TABLE IF NOT EXISTS individual_rewards_program_point_valuations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  individual_id UUID NOT NULL REFERENCES individuals ON DELETE CASCADE,
  rewards_program_id UUID NOT NULL REFERENCES topics__rewards_programs ON DELETE CASCADE,

  value_microunits_per_point BIGINT NOT NULL,
  CHECK (value_microunits_per_point BETWEEN 0 AND 9999999999),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,

  note TEXT,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_ind_rp_point_valuations__individual_rewards_program
    UNIQUE (individual_id, rewards_program_id)
);

CREATE OR REPLACE TRIGGER trigger_individual_rewards_program_point_valuations_updated_at
  BEFORE UPDATE ON individual_rewards_program_point_valuations
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- find a rewards program's point valuations
CREATE INDEX IF NOT EXISTS idx_ind_rewards_program_point_valuations__rewards_program_id
ON individual_rewards_program_point_valuations (rewards_program_id);

CREATE INDEX IF NOT EXISTS idx_ind_rewards_program_point_valuations__currency_code
ON individual_rewards_program_point_valuations (currency_code);

COMMENT ON TABLE individual_rewards_program_point_valuations IS 'Personal point valuations per individual per rewards program.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.individual_id IS 'The individual who set this valuation.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.rewards_program_id IS 'The rewards program being valued.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.value_microunits_per_point IS 'Point value in millionths of the major currency unit.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.currency_code IS 'Currency used to value each point.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.note IS 'Free-text note about this valuation.';

-- ============================================================================
-- Individual Financial Profiles
-- ============================================================================

-- Self-reported financial summary that can optionally pre-fill structured data point forms.
-- Each data point captures its own snapshot in structured_data; this is just a convenience cache.
CREATE TABLE IF NOT EXISTS individual_financial_profiles (
  individual_id UUID PRIMARY KEY REFERENCES individuals ON DELETE CASCADE,

  -- Self-reported credit score bracket (e.g. '740-799')
  credit_score_range TEXT,
  -- Self-reported annual income range in the currency minor unit.
  stated_income_minimum_minor_units BIGINT,
  CHECK (stated_income_minimum_minor_units BETWEEN 0 AND 9007199254740991),
  stated_income_maximum_minor_units BIGINT,
  CHECK (stated_income_maximum_minor_units BETWEEN 0 AND 9007199254740991),
  CHECK (
    stated_income_maximum_minor_units IS NULL
    OR (
      stated_income_minimum_minor_units IS NOT NULL
      AND stated_income_maximum_minor_units > stated_income_minimum_minor_units
    )
  ),
  -- Total credit limit across all open cards in the currency minor unit.
  total_credit_limit_minor_units BIGINT,
  CHECK (total_credit_limit_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  -- Years since oldest credit account was opened
  years_of_credit_history SMALLINT,
  -- Hard credit inquiries in the last 12 months (credit-card relevant)
  hard_inquiries_12m SMALLINT,
  -- New credit cards opened in the last 24 months (relevant for 5/24-style rules)
  cards_opened_24m SMALLINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_individual_financial_profiles_updated_at
BEFORE UPDATE ON individual_financial_profiles
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_individual_financial_profiles__currency_code
ON individual_financial_profiles (currency_code);

COMMENT ON TABLE individual_financial_profiles IS 'Self-reported financial profile used to pre-fill data point submission forms.';
COMMENT ON COLUMN individual_financial_profiles.individual_id IS 'One-to-one with individuals (PK).';
COMMENT ON COLUMN individual_financial_profiles.credit_score_range IS 'Self-reported credit score bracket, e.g. ''740-799''.';
COMMENT ON COLUMN individual_financial_profiles.stated_income_minimum_minor_units IS 'Inclusive lower annual income bound in the currency minor unit.';
COMMENT ON COLUMN individual_financial_profiles.stated_income_maximum_minor_units IS 'Exclusive upper annual income bound in the currency minor unit; NULL means unbounded or no range when the minimum is also NULL.';
COMMENT ON COLUMN individual_financial_profiles.total_credit_limit_minor_units IS 'Total revolving credit limit across all cards in the currency minor unit.';
COMMENT ON COLUMN individual_financial_profiles.currency_code IS 'Currency shared by every monetary value in this profile.';
COMMENT ON COLUMN individual_financial_profiles.years_of_credit_history IS 'Years since oldest open credit account.';
COMMENT ON COLUMN individual_financial_profiles.hard_inquiries_12m IS 'Hard credit inquiries in the last 12 months; relevant for credit-card applications.';
COMMENT ON COLUMN individual_financial_profiles.cards_opened_24m IS 'New credit cards opened in the last 24 months; relevant for 5/24-style issuer rules.';

-- ==========================================================================
-- 0090-00-00-user-profile-links.sql
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_profile_link_types') THEN
    CREATE TYPE user_profile_link_types AS ENUM (
      'url',
      'twitter',
      'facebook',
      'instagram',
      'github',
      'linkedin',
      'youtube',
      'tiktok'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_profile_links (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_type user_profile_link_types NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  url_id UUID REFERENCES urls(id) ON DELETE SET NULL,
  handle TEXT CHECK (char_length(handle) <= 255) CHECK (handle = TRIM(handle)),
  name TEXT CHECK (char_length(name) <= 255) CHECK (name = TRIM(name)),
  image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profile_links__user_id_sort
ON user_profile_links (user_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_user_profile_links__url_id
ON user_profile_links (url_id) WHERE url_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trigger_user_profile_links_updated_at
BEFORE UPDATE ON user_profile_links
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_profile_links IS 'Social and external links displayed on a user''s profile page.';
COMMENT ON COLUMN user_profile_links.user_id IS 'The user who owns this profile link.';
COMMENT ON COLUMN user_profile_links.link_type IS 'The type of link (e.g. url, twitter, github).';
COMMENT ON COLUMN user_profile_links.sort_order IS 'Display order of the link on the user''s profile.';
COMMENT ON COLUMN user_profile_links.url_id IS 'Optional URL entity for link types that use a full URL.';
COMMENT ON COLUMN user_profile_links.handle IS 'Optional social media handle for platform-specific link types.';
COMMENT ON COLUMN user_profile_links.name IS 'Optional display name or label for this link.';
COMMENT ON COLUMN user_profile_links.image_id IS 'Optional custom image/icon for this link.';

-- ==========================================================================
-- 0150-00-00-find-friends-ses-bounce.sql
-- ============================================================================

-- GitHub accounts
CREATE TABLE IF NOT EXISTS github_accounts (
  user_id UUID REFERENCES users ON DELETE SET NULL,
  github_user_id TEXT PRIMARY KEY,
  github_user_email_address TEXT,
  github_user_data JSONB NOT NULL,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  access_token_expires_at TIMESTAMPTZ,
  friends_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_github_accounts_updated_at
BEFORE UPDATE ON github_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_accounts__user_id
ON github_accounts (user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_github_accounts__email
ON github_accounts (github_user_email_address)
WHERE github_user_email_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_github_accounts__token_expires_at
ON github_accounts (access_token_expires_at)
WHERE access_token_expires_at IS NOT NULL;

COMMENT ON TABLE github_accounts IS 'Linked GitHub accounts for OAuth authentication and friend-finding. Stores encrypted OAuth token ciphertext.';
COMMENT ON COLUMN github_accounts.user_id IS 'The Voucha user linked to this GitHub account.';
COMMENT ON COLUMN github_accounts.github_user_id IS 'GitHub''s unique user ID (primary key).';
COMMENT ON COLUMN github_accounts.github_user_email_address IS 'Email address from the GitHub profile.';
COMMENT ON COLUMN github_accounts.github_user_data IS 'Raw JSONB profile data from the GitHub API.';
COMMENT ON COLUMN github_accounts.access_token_ciphertext IS 'Encrypted OAuth access token ciphertext for GitHub API calls.';
COMMENT ON COLUMN github_accounts.refresh_token_ciphertext IS 'Encrypted OAuth refresh token ciphertext for renewing the access token.';
COMMENT ON COLUMN github_accounts.access_token_expires_at IS 'When the current access token expires.';
COMMENT ON COLUMN github_accounts.friends_synced_at IS 'When the user''s GitHub friends list was last synced.';

-- GitHub friends
CREATE TABLE IF NOT EXISTS github_friends (
  github_user_id TEXT NOT NULL REFERENCES github_accounts(github_user_id) ON DELETE CASCADE,
  github_friend_id TEXT NOT NULL,
  PRIMARY KEY (github_user_id, github_friend_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_github_friends_updated_at
BEFORE UPDATE ON github_friends
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_github_friends__friend_id
ON github_friends (github_friend_id);

COMMENT ON TABLE github_friends IS 'GitHub follower/following relationships for friend recommendations.';
COMMENT ON COLUMN github_friends.github_user_id IS 'The GitHub user whose friends list this entry belongs to.';
COMMENT ON COLUMN github_friends.github_friend_id IS 'The GitHub user ID of the friend.';

-- X friends
CREATE TABLE IF NOT EXISTS x_friends (
  x_user_id TEXT NOT NULL REFERENCES x_accounts(x_user_id) ON DELETE CASCADE,
  x_friend_id TEXT NOT NULL,
  PRIMARY KEY (x_user_id, x_friend_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_x_friends_updated_at
BEFORE UPDATE ON x_friends
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_x_friends__friend_id
ON x_friends (x_friend_id);

COMMENT ON TABLE x_friends IS 'X (Twitter) follower/following relationships for friend recommendations.';
COMMENT ON COLUMN x_friends.x_user_id IS 'The X user whose friends list this entry belongs to.';
COMMENT ON COLUMN x_friends.x_friend_id IS 'The X user ID of the friend.';

-- Reverse lookup indexes for recommendation query
CREATE INDEX IF NOT EXISTS idx_facebook_friends__friend_id
ON facebook_friends (facebook_friend_id);

-- Sync status indexes for nightly dispatcher queries
CREATE INDEX IF NOT EXISTS idx_github_accounts__friends_synced_at
ON github_accounts (friends_synced_at)
WHERE user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_facebook_accounts__friends_synced_at
ON facebook_accounts (friends_synced_at)
WHERE user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_x_accounts__friends_synced_at
ON x_accounts (friends_synced_at)
WHERE user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL;

-- SES Bounce Events
DO $$ BEGIN
  CREATE TYPE ses_notification_types AS ENUM ('bounce', 'complaint', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE ses_bounce_types AS ENUM ('permanent', 'transient', 'undetermined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ses_bounce_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  notification_type ses_notification_types NOT NULL,
  bounce_type ses_bounce_types,
  bounce_sub_type TEXT,
  CHECK (bounce_sub_type IS NULL OR (char_length(bounce_sub_type) <= 255 AND TRIM(bounce_sub_type) = bounce_sub_type)),
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  ses_message_id TEXT,
  CHECK (ses_message_id IS NULL OR (char_length(ses_message_id) <= 1024 AND TRIM(ses_message_id) = ses_message_id)),
  ses_feedback_id TEXT,
  CHECK (ses_feedback_id IS NULL OR (char_length(ses_feedback_id) <= 1024 AND TRIM(ses_feedback_id) = ses_feedback_id)),
  ses_timestamp TIMESTAMPTZ,
  raw_message JSONB NOT NULL,
  diagnostic_code TEXT,
  CHECK (diagnostic_code IS NULL OR (char_length(diagnostic_code) <= 1024 AND TRIM(diagnostic_code) = diagnostic_code)),
  reporting_mta TEXT,
  CHECK (reporting_mta IS NULL OR (char_length(reporting_mta) <= 255 AND TRIM(reporting_mta) = reporting_mta)),
  dedup_key TEXT,
  CHECK (dedup_key IS NULL OR char_length(dedup_key) = 64)
);

-- GIN index for querying bounced email addresses in recipients array
CREATE INDEX IF NOT EXISTS idx_ses_bounce_events__recipients
ON ses_bounce_events USING GIN (recipients);

-- Index to correlate with sent emails by SES message ID
CREATE INDEX IF NOT EXISTS idx_ses_bounce_events__ses_message_id
ON ses_bounce_events (ses_message_id)
WHERE ses_message_id IS NOT NULL;

-- Index for looking up bounces by notification type and id (for pagination)
CREATE INDEX IF NOT EXISTS idx_ses_bounce_events__notification_type
ON ses_bounce_events (notification_type, id DESC);

-- Enforces at-least-once redelivery (SQS, or a retried Lambda invocation) does not create a
-- duplicate row. NULL (missing ses_message_id or ses_timestamp) is never deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ses_bounce_events__dedup_key
ON ses_bounce_events (dedup_key)
WHERE dedup_key IS NOT NULL;

COMMENT ON TABLE ses_bounce_events IS 'Records email bounce, complaint, and delivery notifications received from AWS SES.';
COMMENT ON COLUMN ses_bounce_events.notification_type IS 'SES notification type: bounce, complaint, or delivery.';
COMMENT ON COLUMN ses_bounce_events.bounce_type IS 'Bounce classification: permanent, transient, or undetermined.';
COMMENT ON COLUMN ses_bounce_events.bounce_sub_type IS 'Detailed bounce sub-type from SES (e.g. General, NoEmail).';
COMMENT ON COLUMN ses_bounce_events.recipients IS 'JSONB array of recipient email addresses affected by this event.';
COMMENT ON COLUMN ses_bounce_events.ses_message_id IS 'SES message ID for correlating with sent emails.';
COMMENT ON COLUMN ses_bounce_events.ses_feedback_id IS 'SES feedback ID for the notification.';
COMMENT ON COLUMN ses_bounce_events.ses_timestamp IS 'Timestamp from the SES notification payload.';
COMMENT ON COLUMN ses_bounce_events.raw_message IS 'Full raw SES notification payload for debugging.';
COMMENT ON COLUMN ses_bounce_events.diagnostic_code IS 'SMTP diagnostic code from the bounce (e.g. 550 5.1.1).';
COMMENT ON COLUMN ses_bounce_events.reporting_mta IS 'The MTA that reported the bounce.';
COMMENT ON COLUMN ses_bounce_events.dedup_key IS 'SHA-256 hex digest of ses_message_id, notification_type, ses_timestamp, and the sorted normalized recipients; NULL when ses_message_id or ses_timestamp is missing. Absorbs at-least-once redelivery duplicates without collapsing distinct per-recipient notifications that share a mail.messageId and timestamp.';

-- ==========================================================================
-- 0009-00-00-user-metrics.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_metrics (
  id UUID PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Bookmark counts (how many entities this user bookmarked)
  bookmarks__follow__topics_count INT DEFAULT 0,
  bookmarks__follow__posts_count INT DEFAULT 0,
  bookmarks__follow__users_count INT DEFAULT 0,

  -- Bookmarkers counts (how many users bookmarked this user)
  bookmarkers__follow_count INT DEFAULT 0,

  bookmarks__updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_user_metrics_updated_at
BEFORE UPDATE ON user_metrics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_metrics IS 'Aggregated metrics for users: bookmark counts and follower counts.';
COMMENT ON COLUMN user_metrics.bookmarks__follow__topics_count IS 'Number of topics this user bookmarks/follows.';
COMMENT ON COLUMN user_metrics.bookmarks__follow__posts_count IS 'Number of posts this user bookmarks/follows.';
COMMENT ON COLUMN user_metrics.bookmarks__follow__users_count IS 'Number of users this user follows.';
COMMENT ON COLUMN user_metrics.bookmarkers__follow_count IS 'Number of users who follow this user.';
COMMENT ON COLUMN user_metrics.bookmarks__updated_at IS 'When the bookmark/follow metrics were last recalculated.';

-- Function to auto-create user_metrics row when user is created
CREATE OR REPLACE FUNCTION fn_create_user_metrics_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_metrics (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create user_metrics after user insert
CREATE TRIGGER trigger_create_user_metrics
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION fn_create_user_metrics_on_insert();

-- Partial index supporting orphaned GitHub OAuth account retention cleanup:
-- WHERE user_id IS NULL AND created_at is older than the retention cutoff
-- ORDER BY created_at ASC, github_user_id ASC
CREATE INDEX IF NOT EXISTS idx_github_accounts__orphan_retention_cleanup
ON github_accounts (created_at, github_user_id)
WHERE user_id IS NULL;
