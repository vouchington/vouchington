-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: folded github oauth-retention-cleanup-indexes idempotent
-- Merged from: 0050-00-00-individuals-households.sql, 0090-00-00-user-profile-links.sql, 0150-00-00-find-friends-ses-bounce.sql, 0009-00-00-user-metrics.sql

-- ==========================================================================
-- 0050-00-00-individuals-households.sql
-- ============================================================================

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS individuals (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_individuals_fn_update_updated_at
  BEFORE UPDATE ON individuals
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE individuals IS 'Represents a real person. A user account maps to one individual for personal finance tracking.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  -- the person who owns this household
  owner_user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_households_fn_update_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- Supports deterministic owned-household selection and cursor pagination.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_households__owner_updated_id
ON households (owner_user_id, updated_at DESC, id DESC);

COMMENT ON TABLE households IS 'A household owned by a user, grouping individuals for shared finance tracking.';
COMMENT ON COLUMN households.owner_user_id IS 'The user who owns and manages this household.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_household_members_fn_update_updated_at
  BEFORE UPDATE ON household_members
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- Supports deterministic household-membership cursor pagination.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_household_members__household_updated_id
ON household_members (household_id, updated_at DESC, id DESC);

-- Supports member-only household access checks without scanning unrelated memberships.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_household_members__individual_household
ON household_members (individual_id, household_id);

COMMENT ON TABLE household_members IS 'Join table linking individuals to households with a relationship descriptor.';
COMMENT ON COLUMN household_members.household_id IS 'The household this membership belongs to.';
COMMENT ON COLUMN household_members.individual_id IS 'The individual who is a member of the household.';
COMMENT ON COLUMN household_members.relationship IS 'Relationship to the household owner (e.g. husband, wife, child).';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS individual_cards (
  -- an individual can have more than one of the same type of card
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  individual_id UUID NOT NULL REFERENCES individuals ON DELETE CASCADE,
  card_topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,

  opened_on DATE,
  closed_on DATE,
  credit_limit_minor_units BIGINT,
  CHECK (credit_limit_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  CHECK ((credit_limit_minor_units IS NULL) = (currency_code IS NULL)),
  received_sign_up_bonus_on DATE,

  -- set `is_authorized_user` to `true` if this card is an AU of another card
  is_authorized_user BOOLEAN DEFAULT FALSE,
  -- set `authorized_user_of_card_id` to the card that this card is an AU of
  authorized_user_of_card_id UUID REFERENCES individual_cards ON DELETE SET NULL,
  CHECK (NOT (authorized_user_of_card_id IS NOT NULL AND is_authorized_user IS FALSE)),

  note TEXT,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_individual_cards_fn_update_updated_at
  BEFORE UPDATE ON individual_cards
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- find a card's users
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_individual_cards__card_id
ON individual_cards (card_topic_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_individual_cards__currency_code
ON individual_cards (currency_code)
WHERE currency_code IS NOT NULL;

COMMENT ON TABLE individual_cards IS 'Credit/debit cards held by individuals. An individual can hold multiple cards of the same type.';
COMMENT ON COLUMN individual_cards.individual_id IS 'The individual who holds this card.';
COMMENT ON COLUMN individual_cards.card_topic_id IS 'The card topic (references topics where topic_type = ''card'').';
COMMENT ON COLUMN individual_cards.opened_on IS 'Date the card account was opened.';
COMMENT ON COLUMN individual_cards.closed_on IS 'Date the card account was closed. NULL if still open.';
COMMENT ON COLUMN individual_cards.credit_limit_minor_units IS 'Credit limit in the currency minor unit.';
COMMENT ON COLUMN individual_cards.currency_code IS 'Currency for the credit limit.';
COMMENT ON COLUMN individual_cards.received_sign_up_bonus_on IS 'Date the sign-up bonus was received.';
COMMENT ON COLUMN individual_cards.is_authorized_user IS 'TRUE if this card is an authorized user card on another account.';
COMMENT ON COLUMN individual_cards.authorized_user_of_card_id IS 'The primary cardholder''s individual_cards row, if this is an AU.';
COMMENT ON COLUMN individual_cards.note IS 'Free-text note about this card.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS individual_rewards_program_statuses (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  individual_id UUID NOT NULL REFERENCES individuals ON DELETE CASCADE,
  rewards_program_status_topic_id UUID NOT NULL CONSTRAINT fk_individual_rewards_program_statuses__rewards_program_status REFERENCES rewards_program_status_topics ON DELETE CASCADE, -- e.g. Marriott Bonvoy Platinum Elite Status

  started_on DATE,
  expires_on DATE,
  CHECK ((started_on IS NULL OR expires_on IS NULL) OR started_on <= expires_on),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_individual_rewards_program_statuses_updated_at
  BEFORE UPDATE ON individual_rewards_program_statuses
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- find a rewards program status's users
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_individual_rewards_program_statuses__status_topic_id
ON individual_rewards_program_statuses (rewards_program_status_topic_id);

COMMENT ON TABLE individual_rewards_program_statuses IS 'Rewards program tier statuses held by individuals (e.g. Marriott Platinum Elite).';
COMMENT ON COLUMN individual_rewards_program_statuses.individual_id IS 'The individual who holds this status.';
COMMENT ON COLUMN individual_rewards_program_statuses.rewards_program_status_topic_id IS 'The specific tier status (references rewards_program_status_topics).';
COMMENT ON COLUMN individual_rewards_program_statuses.started_on IS 'Date the status was earned or started.';
COMMENT ON COLUMN individual_rewards_program_statuses.expires_on IS 'Date the status expires. NULL if ongoing.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS spending_entries (
  -- an individual or household can have more than one entry for the same spending category
  -- e.g. want to split Amazon purchases between the types of purchases (recurring, one-time, discretionary, etc.)
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  -- exactly one of household_id or individual_id must be set
  household_id UUID REFERENCES households ON DELETE CASCADE,
  individual_id UUID REFERENCES individuals ON DELETE CASCADE,
  CHECK (NOT (household_id IS NOT NULL AND individual_id IS NOT NULL)), -- only one can be set
  CHECK (NOT (household_id IS NULL AND individual_id IS NULL)), -- at least one must be set
  spending_category_topic_id UUID NOT NULL REFERENCES spending_category_topics ON DELETE CASCADE,

  spending_frequency spending_frequencies NOT NULL DEFAULT 'monthly',
  amount_minor_units BIGINT NOT NULL,
  CHECK (amount_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,

  note TEXT,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- calculate metrics for a spending category
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_spending_entries__spending_category_topic_id
ON spending_entries (spending_category_topic_id);

-- Index for foreign key on currency
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_spending_entries__currency_code
ON spending_entries (currency_code);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_spending_entries_fn_update_updated_at
  BEFORE UPDATE ON spending_entries
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE spending_entries IS 'Spending amounts per category, associated with either a household or individual.';
COMMENT ON COLUMN spending_entries.household_id IS 'The household this spending is for. Mutually exclusive with individual_id.';
COMMENT ON COLUMN spending_entries.individual_id IS 'The individual this spending is for. Mutually exclusive with household_id.';
COMMENT ON COLUMN spending_entries.spending_category_topic_id IS 'The spending category (references spending_category_topics).';
COMMENT ON COLUMN spending_entries.spending_frequency IS 'How often this spending occurs (monthly or annually).';
COMMENT ON COLUMN spending_entries.amount_minor_units IS 'Spending amount per frequency period in the currency minor unit.';
COMMENT ON COLUMN spending_entries.currency_code IS 'Currency of the spending amount.';
COMMENT ON COLUMN spending_entries.note IS 'Free-text note about this spending entry.';

-- Add FK from users.individual_id to individuals (column defined in 0010)
ALTER TABLE users
  ADD CONSTRAINT fk_users_individual_id FOREIGN KEY (individual_id) REFERENCES individuals (id) ON DELETE SET NULL NOT VALID;

ALTER TABLE users VALIDATE CONSTRAINT fk_users_individual_id;

-- unique index on individual_id
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users__individual_id
ON users (individual_id)
WHERE individual_id IS NOT NULL;

COMMENT ON COLUMN users.individual_id IS 'The real-person individual linked to this user account for personal finance tracking.';

-- Create a trigger function that automatically creates individual, household, and membership for new users
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
  INSERT INTO households (owner_user_id)
  VALUES (NEW.id)
  RETURNING id INTO new_household_id;

  -- Create membership linking individual to household
  INSERT INTO household_members (household_id, individual_id)
  VALUES (new_household_id, new_individual_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that runs after user creation
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_users_create_individual_household
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_user_individual_household();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS individual_rewards_program_point_valuations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  individual_id UUID NOT NULL REFERENCES individuals ON DELETE CASCADE,
  rewards_program_topic_id UUID NOT NULL CONSTRAINT fk_individ_rewards_program_point_valuati__rewards_program_topic REFERENCES rewards_program_topics ON DELETE CASCADE,

  value_microunits_per_point BIGINT NOT NULL,
  CONSTRAINT chk_indiv_rewar_progra_point_valuat__value_microunits_per_point CHECK (value_microunits_per_point BETWEEN 0 AND 9999999999),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,

  note TEXT,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_ind_rp_point_valuations__individual_rewards_program
    UNIQUE (individual_id, rewards_program_topic_id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_individual_rewards_program_point_valuations_updated_at
  BEFORE UPDATE ON individual_rewards_program_point_valuations
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

-- find a rewards program's point valuations
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_ind_rewards_program_point_valuations__program_topic_id
ON individual_rewards_program_point_valuations (rewards_program_topic_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_ind_rewards_program_point_valuations__currency_code
ON individual_rewards_program_point_valuations (currency_code);

COMMENT ON TABLE individual_rewards_program_point_valuations IS 'Personal point valuations per individual per rewards program.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.individual_id IS 'The individual who set this valuation.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.rewards_program_topic_id IS 'The rewards program being valued.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.value_microunits_per_point IS 'Point value in millionths of the major currency unit.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.currency_code IS 'Currency used to value each point.';
COMMENT ON COLUMN individual_rewards_program_point_valuations.note IS 'Free-text note about this valuation.';

-- ============================================================================
-- Individual Financial Profiles
-- ============================================================================

-- Self-reported financial summary that can optionally pre-fill structured data point forms.
-- Each data point captures its own snapshot in structured_data; this is just a convenience cache.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS individual_financial_profiles (
  individual_id UUID PRIMARY KEY REFERENCES individuals ON DELETE CASCADE,

  -- Self-reported credit score bracket (e.g. '740-799')
  credit_score_range TEXT,
  -- Self-reported annual income range in the currency minor unit.
  stated_income_minimum_minor_units BIGINT,
  CONSTRAINT chk_individ_financi_profiles__stated_income_minimum_minor_units CHECK (stated_income_minimum_minor_units BETWEEN 0 AND 9007199254740991),
  stated_income_maximum_minor_units BIGINT,
  CONSTRAINT chk_individ_financi_profiles__stated_income_maximum_minor_units CHECK (stated_income_maximum_minor_units BETWEEN 0 AND 9007199254740991),
  CHECK (
    stated_income_maximum_minor_units IS NULL
    OR (
      stated_income_minimum_minor_units IS NOT NULL
      AND stated_income_maximum_minor_units > stated_income_minimum_minor_units
    )
  ),
  -- Total credit limit across all open cards in the currency minor unit.
  total_credit_limit_minor_units BIGINT,
  CONSTRAINT chk_individu_financial_profiles__total_credit_limit_minor_units CHECK (total_credit_limit_minor_units BETWEEN 0 AND 9007199254740991),
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_individual_financial_profiles_updated_at
BEFORE UPDATE ON individual_financial_profiles
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_profile_links__user_id_sort
ON user_profile_links (user_id, sort_order);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_profile_links__url_id
ON user_profile_links (url_id) WHERE url_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_github_accounts_updated_at
BEFORE UPDATE ON github_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_accounts__user_id
ON github_accounts (user_id)
WHERE user_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_github_accounts__email
ON github_accounts (github_user_email_address)
WHERE github_user_email_address IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS github_friends (
  github_user_id TEXT NOT NULL REFERENCES github_accounts(github_user_id) ON DELETE CASCADE,
  github_friend_id TEXT NOT NULL,
  PRIMARY KEY (github_user_id, github_friend_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_github_friends_updated_at
BEFORE UPDATE ON github_friends
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_github_friends__friend_id
ON github_friends (github_friend_id);

COMMENT ON TABLE github_friends IS 'GitHub follower/following relationships for friend recommendations.';
COMMENT ON COLUMN github_friends.github_user_id IS 'The GitHub user whose friends list this entry belongs to.';
COMMENT ON COLUMN github_friends.github_friend_id IS 'The GitHub user ID of the friend.';

-- X friends
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS x_friends (
  x_user_id TEXT NOT NULL REFERENCES x_accounts(x_user_id) ON DELETE CASCADE,
  x_friend_id TEXT NOT NULL,
  PRIMARY KEY (x_user_id, x_friend_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_x_friends_updated_at
BEFORE UPDATE ON x_friends
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_x_friends__friend_id
ON x_friends (x_friend_id);

COMMENT ON TABLE x_friends IS 'X (Twitter) follower/following relationships for friend recommendations.';
COMMENT ON COLUMN x_friends.x_user_id IS 'The X user whose friends list this entry belongs to.';
COMMENT ON COLUMN x_friends.x_friend_id IS 'The X user ID of the friend.';

-- Reverse lookup indexes for recommendation query
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_facebook_friends__friend_id
ON facebook_friends (facebook_friend_id);

-- Sync status indexes for nightly dispatcher queries
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_github_accounts__friends_synced_at
ON github_accounts (friends_synced_at)
WHERE user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_facebook_accounts__friends_synced_at
ON facebook_accounts (friends_synced_at)
WHERE user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_x_accounts__friends_synced_at
ON x_accounts (friends_synced_at)
WHERE user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL;

-- SES Bounce Events
DO $$ BEGIN
  CREATE TYPE amazon_ses_notification_types AS ENUM ('bounce', 'complaint', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE amazon_ses_bounce_types AS ENUM ('permanent', 'transient', 'undetermined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS amazon_ses_bounce_subtypes (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE amazon_ses_bounce_subtypes IS 'SES bounce subtype names registered on first sight; the provider owns this open set and exact spelling.';
COMMENT ON COLUMN amazon_ses_bounce_subtypes.id IS 'Exact provider value used as the natural lookup key; never normalized.';
COMMENT ON COLUMN amazon_ses_bounce_subtypes.created_at IS 'When this provider value was first observed.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS amazon_ses_bounce_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  notification_type amazon_ses_notification_types NOT NULL,
  bounce_type amazon_ses_bounce_types,
  amazon_ses_bounce_subtype_id TEXT REFERENCES amazon_ses_bounce_subtypes(id) ON DELETE RESTRICT,
  CHECK (amazon_ses_bounce_subtype_id IS NULL OR (char_length(amazon_ses_bounce_subtype_id) <= 255 AND TRIM(amazon_ses_bounce_subtype_id) = amazon_ses_bounce_subtype_id)),
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  amazon_ses_message_id TEXT,
  CHECK (amazon_ses_message_id IS NULL OR (char_length(amazon_ses_message_id) <= 1024 AND TRIM(amazon_ses_message_id) = amazon_ses_message_id)),
  amazon_ses_feedback_id TEXT,
  CHECK (amazon_ses_feedback_id IS NULL OR (char_length(amazon_ses_feedback_id) <= 1024 AND TRIM(amazon_ses_feedback_id) = amazon_ses_feedback_id)),
  occurred_at TIMESTAMPTZ,
  raw_message JSONB NOT NULL,
  diagnostic_code TEXT,
  CHECK (diagnostic_code IS NULL OR (char_length(diagnostic_code) <= 1024 AND TRIM(diagnostic_code) = diagnostic_code)),
  reporting_mta TEXT,
  CHECK (reporting_mta IS NULL OR (char_length(reporting_mta) <= 255 AND TRIM(reporting_mta) = reporting_mta)),
  dedup_key TEXT,
  CHECK (dedup_key IS NULL OR char_length(dedup_key) = 64)
);

-- GIN index for querying bounced email addresses in recipients array
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_amazon_ses_bounce_events__recipients
ON amazon_ses_bounce_events USING GIN (recipients);

-- Index to correlate with sent emails by SES message ID
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_amazon_ses_bounce_events__amazon_ses_message_id
ON amazon_ses_bounce_events (amazon_ses_message_id)
WHERE amazon_ses_message_id IS NOT NULL;

-- Index for looking up bounces by notification type and id (for pagination)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_amazon_ses_bounce_events__notification_type
ON amazon_ses_bounce_events (notification_type, id DESC);

-- Enforces at-least-once redelivery (SQS, or a retried Lambda invocation) does not create a
-- duplicate row. NULL (missing amazon_ses_message_id or occurred_at) is never deduplicated.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_amazon_ses_bounce_events__dedup_key
ON amazon_ses_bounce_events (dedup_key)
WHERE dedup_key IS NOT NULL;

COMMENT ON TABLE amazon_ses_bounce_events IS 'Records email bounce, complaint, and delivery notifications received from AWS SES.';
COMMENT ON COLUMN amazon_ses_bounce_events.notification_type IS 'SES notification type: bounce, complaint, or delivery.';
COMMENT ON COLUMN amazon_ses_bounce_events.bounce_type IS 'Bounce classification: permanent, transient, or undetermined.';
COMMENT ON COLUMN amazon_ses_bounce_events.amazon_ses_bounce_subtype_id IS 'Detailed bounce sub-type from SES (e.g. General, NoEmail).';
COMMENT ON COLUMN amazon_ses_bounce_events.recipients IS 'JSONB array of recipient email addresses affected by this event.';
COMMENT ON COLUMN amazon_ses_bounce_events.amazon_ses_message_id IS 'SES message ID for correlating with sent emails.';
COMMENT ON COLUMN amazon_ses_bounce_events.amazon_ses_feedback_id IS 'SES feedback ID for the notification.';
COMMENT ON COLUMN amazon_ses_bounce_events.occurred_at IS 'Timestamp from the SES notification payload.';
COMMENT ON COLUMN amazon_ses_bounce_events.raw_message IS 'Full raw SES notification payload for debugging.';
COMMENT ON COLUMN amazon_ses_bounce_events.diagnostic_code IS 'SMTP diagnostic code from the bounce (e.g. 550 5.1.1).';
COMMENT ON COLUMN amazon_ses_bounce_events.reporting_mta IS 'The MTA that reported the bounce.';
COMMENT ON COLUMN amazon_ses_bounce_events.dedup_key IS 'SHA-256 hex digest of amazon_ses_message_id, notification_type, occurred_at, and the sorted normalized recipients; NULL when amazon_ses_message_id or occurred_at is missing. Absorbs at-least-once redelivery duplicates without collapsing distinct per-recipient notifications that share a mail.messageId and timestamp.';

-- ==========================================================================
-- 0009-00-00-user-metrics.sql
-- ============================================================================

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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

-- Trigger to create user_metrics after user insert
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_create_user_metrics
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION fn_create_metrics('user_metrics', 'id');

-- Partial index supporting orphaned GitHub OAuth account retention cleanup:
-- WHERE user_id IS NULL AND created_at is older than the retention cutoff
-- ORDER BY created_at ASC, github_user_id ASC
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_github_accounts__orphan_retention_cleanup
ON github_accounts (created_at, github_user_id)
WHERE user_id IS NULL;

-- Current indexes for fresh schema bootstrap.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_individual_cards__authorized_user_of_id
  ON individual_cards (authorized_user_of_card_id)
  WHERE authorized_user_of_card_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_profile_links__image_id
  ON user_profile_links (image_id)
  WHERE image_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_individual_cards__individual_id_id
  ON individual_cards (individual_id, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_individua_rewards_program_point_valuation__individual_id_id
  ON individual_rewards_program_point_valuations (individual_id, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_individual_rewards_program_statuses__individual_id_id
  ON individual_rewards_program_statuses (individual_id, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_spending_entries__individual_id_id
  ON spending_entries (individual_id, id)
  WHERE individual_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_spending_entries__household_id_id
  ON spending_entries (household_id, id)
  WHERE household_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_amazon_ses_bounce_events__amazon_ses_bounce_subtype_id
  ON amazon_ses_bounce_events (amazon_ses_bounce_subtype_id);

COMMENT ON COLUMN github_friends.last_observed_at IS 'Database timestamp of the latest provider friend-sync observation; stale observations are removed against the exact sync-start clock.';
COMMENT ON COLUMN x_friends.last_observed_at IS 'Database timestamp of the latest provider friend-sync observation; stale observations are removed against the exact sync-start clock.';
