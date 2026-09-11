-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added ui_locale and language detection columns for bio
-- edited-in-place: folded oauth-retention-cleanup-indexes idempotent
-- edited-in-place: folded moderator/developer role seeds from 0380-00-00-moderator-role, 0400-00-00-developer-role
-- edited-in-place: added is_system flag for reserved system-username reclaim
-- edited-in-place: partitioned session_referral_attributions by RANGE (id)
-- Merged from: 0001-00-00-users-and-auth.sql, 0002-00-00-oauth-urls.sql

-- ==========================================================================
-- 0001-00-00-users-and-auth.sql
-- ============================================================================

-- Merged from: 0001-00-00-users, 0001-00-01-email-addresses, 0001-00-02-email-address-indexes,
-- 0001-00-02-phone-numbers, 0001-00-03-authorization, 0001-00-04-meta, 0001-00-05-passkeys,
-- 0001-00-11-session-referral-attributions
-- Absorbed columns from: 0200-00-01, 0200-00-02, 0210-00-00, 0220-00-00, 0230-00-00, 0232-00-00

-- ============================================================================
-- ENUMs
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_display_name_source AS ENUM (
  'username',
  'facebook',
  'x',
  'apple',
  'google',
  'linkedin',
  'microsoft',
  'github'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_privacy_audiences AS ENUM ('everyone', 'users', 'followers', 'mutual_followers', 'nobody');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE broadcast_types AS ENUM ('everyone', 'users', 'followers', 'mutual_followers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE privacy_types AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'passkey_device_types') THEN
    CREATE TYPE passkey_device_types AS ENUM ('singleDevice', 'multiDevice');
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE identity_verification_statuses AS ENUM (
    'unverified',
    'payment_pending',
    'identity_pending',
    'verified',
    'failed',
    'duplicate_id'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE identity_verification_statuses IS 'Lifecycle states for a user''s identity verification attempt.';

DO $$ BEGIN
  CREATE TYPE identity_verification_providers AS ENUM (
    'stripe_identity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE identity_verification_providers IS 'Supported identity-verification provider backends.';

DO $$ BEGIN
  CREATE TYPE public_verified_name_displays AS ENUM (
    'hidden',
    'first_name',
    'first_name_last_initial',
    'full_name'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public_verified_name_displays IS 'How much of a verified user''s legal name to display publicly.';

DO $$ BEGIN
  CREATE TYPE verified_identity_statuses AS ENUM (
    'active',
    'revoked',
    'transferred'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE verified_identity_statuses IS 'Status of a verified_identities record.';

DO $$ BEGIN
  CREATE TYPE engagement_email_types AS ENUM (
    'follow_topics',
    'post_referral_link',
    'follow_news_sources'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE engagement_email_types IS 'One-time engagement onboarding email types tracked for idempotent sends.';

DO $$ BEGIN
  CREATE TYPE moderation_email_cadences AS ENUM ('daily', 'selected_days', 'weekly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- users
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  -- public
  use_display_name_from user_display_name_source DEFAULT 'username',
  username TEXT DEFAULT NULL,
  CHECK (username IS NULL OR char_length(username) <= 255),
  CHECK (username IS NULL OR username = TRIM(username)),
  is_system BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE only for platform/agent accounts; never set from any user-writable path

  -- user profile
  markdown TEXT NOT NULL DEFAULT '',

  -- user settings
  -- TRUE = opt-in
  -- FALSE = opt-out
  -- NULL = not set
  third_party_marketing BOOLEAN DEFAULT NULL,
  engagement_emails_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  news_digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (news_digest_frequency IN ('none', 'daily', 'weekly')),
  moderation_emails_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- Per-user opt-in to ActivityPub federation (Phase C). Default FALSE: federation exposes a
  -- public AP actor (/ap/users/:id) and accepts inbound follows, so it must never be silently on.
  fediverse_federation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  community_digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (community_digest_frequency IN ('none', 'daily', 'weekly')),
  moderation_email_cadence moderation_email_cadences NOT NULL DEFAULT 'daily',
  moderation_email_days_of_week SMALLINT[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::SMALLINT[] CHECK (
    cardinality(moderation_email_days_of_week) > 0
    AND moderation_email_days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::SMALLINT[]
  ),
  moderation_email_time_of_day TEXT NOT NULL DEFAULT '09:00' CHECK (moderation_email_time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  moderation_email_timezone TEXT CHECK (moderation_email_timezone IS NULL OR char_length(moderation_email_timezone) BETWEEN 1 AND 64),
  country TEXT CHECK (country IS NULL OR (country = UPPER(country) AND country ~ '^[A-Z]{2}$')),
  ui_locale TEXT CHECK (ui_locale IS NULL OR (ui_locale = LOWER(ui_locale) AND LENGTH(ui_locale) <= 10)),
  lingua_rs_detected_language TEXT CHECK (lingua_rs_detected_language IS NULL OR (lingua_rs_detected_language = LOWER(lingua_rs_detected_language) AND LENGTH(lingua_rs_detected_language) <= 10)),
  lingua_rs_content_sha256 BYTEA CHECK (lingua_rs_content_sha256 IS NULL OR LENGTH(lingua_rs_content_sha256) = 32),
  lingua_rs_input_sha256 BYTEA CHECK (lingua_rs_input_sha256 IS NULL OR LENGTH(lingua_rs_input_sha256) = 32),
  lingua_rs_results JSONB,
  lingua_rs_detected_at TIMESTAMPTZ,

  -- privacy settings: who can see what
  cards_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  rewards_program_statuses_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  spending_categories_visibility user_privacy_audiences NOT NULL DEFAULT 'nobody',
  follows_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  topic_follows_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  rss_feed_follows_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  community_memberships_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  followers_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  likes_visibility user_privacy_audiences NOT NULL DEFAULT 'everyone',
  default_post_broadcast broadcast_types NOT NULL DEFAULT 'everyone',
  default_post_privacy privacy_types NOT NULL DEFAULT 'public',
  direct_messages_audience user_privacy_audiences NOT NULL DEFAULT 'everyone',

  -- admin settings
  vote_weight FLOAT DEFAULT 1,
  vote_weight_admin_set_at TIMESTAMPTZ,
  vote_weight_recalculated_at TIMESTAMPTZ,
  votes_snapshot_xmax XID8,
  votes_snapshot_xip_count INTEGER,
  CONSTRAINT chk_users_votes_snapshot_complete CHECK (
    (votes_snapshot_xmax IS NULL AND votes_snapshot_xip_count IS NULL)
    OR (votes_snapshot_xmax IS NOT NULL AND votes_snapshot_xip_count IS NOT NULL AND votes_snapshot_xip_count >= 0)
  ),

  -- referral attribution
  referrer_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- GDPR right to restrict processing
  processing_restricted_at TIMESTAMPTZ,

  bad_faith_reporter_at TIMESTAMPTZ,

  -- identity verification
  verification_status identity_verification_statuses NOT NULL DEFAULT 'unverified',
  verification_provider identity_verification_providers,
  verification_completed_at TIMESTAMPTZ,
  verified_badge_visible BOOLEAN NOT NULL DEFAULT TRUE,
  public_verified_name_display public_verified_name_displays NOT NULL DEFAULT 'hidden',
  verified_first_name TEXT,
  verified_last_name_initial TEXT,
  verified_full_name TEXT,
  pending_verification_session_id TEXT,
  pending_checkout_session_id TEXT,

  -- profile image (FK added in 0040)
  profile_image_id UUID,

  -- linked individual (FK added in 0065)
  individual_id UUID,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- unique index on username (exclude NULLs so multiple users can have NULL username)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users__username
ON users (LOWER(username))
WHERE username IS NOT NULL;

-- search users by username
CREATE INDEX IF NOT EXISTS idx_users__username__text_pattern_ops
ON users (LOWER(username) text_pattern_ops)
WHERE username IS NOT NULL;

-- partial index for referral attribution queries
CREATE INDEX IF NOT EXISTS idx_users__referrer_id ON users (referrer_id) WHERE referrer_id IS NOT NULL;

-- soft-deleted users lookup
CREATE INDEX IF NOT EXISTS idx_users__deleted_at
  ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- vote weight recalculation candidates
CREATE INDEX IF NOT EXISTS idx_users__vote_weight_recalculation
  ON users (vote_weight_recalculated_at)
  WHERE deleted_at IS NULL AND vote_weight_admin_set_at IS NULL;

-- find users pending language detection (bio)
CREATE INDEX IF NOT EXISTS users_lingua_rs_pending_idx
  ON users (id)
  WHERE lingua_rs_input_sha256 IS NULL;

COMMENT ON TABLE users IS 'User accounts. Core identity table for all registered users.';
COMMENT ON COLUMN users.is_system IS 'Marks a row as a system-owned account (e.g. jong admin, customer-support, autotagger). Reserved-username seed generators reclaim the username from any non-system holder before upserting here, and role/lookup gates require is_system = TRUE so a squatter can never inherit a system identity.';
COMMENT ON COLUMN users.use_display_name_from IS 'Which source to use for the displayed name (username, facebook, x, etc.).';
COMMENT ON COLUMN users.username IS 'Unique username chosen by the user. NULL if not yet set. Case-insensitive (stored lowercase).';
COMMENT ON COLUMN users.markdown IS 'User profile bio in markdown format.';
COMMENT ON COLUMN users.third_party_marketing IS 'Marketing opt-in/out: TRUE=opted in, FALSE=opted out, NULL=not set.';
COMMENT ON COLUMN users.engagement_emails_enabled IS 'Whether the user receives engagement recommendation emails.';
COMMENT ON COLUMN users.news_digest_frequency IS 'Frequency for first-party news digest emails.';
COMMENT ON COLUMN users.moderation_emails_enabled IS 'Whether the user receives community moderation summary emails.';
COMMENT ON COLUMN users.fediverse_federation_enabled IS 'Per-user opt-in to ActivityPub federation (Phase C). Default FALSE; when TRUE, a public AP actor is exposed at /ap/users/:id and inbound follows are auto-accepted.';
COMMENT ON COLUMN users.community_digest_frequency IS 'Frequency for community digest emails.';
COMMENT ON COLUMN users.moderation_email_cadence IS 'Cadence for community moderation summary emails.';
COMMENT ON COLUMN users.moderation_email_days_of_week IS 'Days of week for selected-day moderation email cadence, 1=Monday and 7=Sunday.';
COMMENT ON COLUMN users.moderation_email_time_of_day IS 'Local HH:MM time for moderation summary emails.';
COMMENT ON COLUMN users.moderation_email_timezone IS 'IANA timezone for moderation summary email scheduling.';
COMMENT ON COLUMN users.country IS 'User preferred country as ISO 3166-1 alpha-2 (e.g., US).';
COMMENT ON COLUMN users.ui_locale IS 'User preferred UI locale from supported UI message catalogs (e.g., en).';
COMMENT ON COLUMN users.cards_visibility IS 'Privacy: who can see this user''s cards.';
COMMENT ON COLUMN users.rewards_program_statuses_visibility IS 'Privacy: who can see this user''s rewards program statuses.';
COMMENT ON COLUMN users.spending_categories_visibility IS 'Privacy: who can see this user''s spending categories.';
COMMENT ON COLUMN users.follows_visibility IS 'Privacy: who can see who this user follows (user follows).';
COMMENT ON COLUMN users.topic_follows_visibility IS 'Privacy: who can see this user''s topic follows.';
COMMENT ON COLUMN users.rss_feed_follows_visibility IS 'Privacy: who can see this user''s RSS feed follows.';
COMMENT ON COLUMN users.community_memberships_visibility IS 'Privacy: who can see this user''s community memberships.';
COMMENT ON COLUMN users.followers_visibility IS 'Privacy: who can see this user''s followers.';
COMMENT ON COLUMN users.likes_visibility IS 'Privacy: who can see this user''s likes.';
COMMENT ON COLUMN users.direct_messages_audience IS 'Privacy: who can send this user direct messages.';
COMMENT ON COLUMN users.default_post_broadcast IS 'Default audience setting for new posts.';
COMMENT ON COLUMN users.default_post_privacy IS 'Default privacy setting for new posts.';
COMMENT ON COLUMN users.vote_weight IS 'Admin-set multiplier for this user''s votes. Default 1.';
COMMENT ON COLUMN users.vote_weight_admin_set_at IS 'When an admin last manually overrode this user''s vote weight. NULL if never overridden.';
COMMENT ON COLUMN users.vote_weight_recalculated_at IS 'When the vote weight was last recalculated automatically. NULL if never recalculated.';
COMMENT ON COLUMN users.votes_snapshot_xmax IS 'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.';
COMMENT ON COLUMN users.votes_snapshot_xip_count IS 'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.';
COMMENT ON COLUMN users.referrer_id IS 'The user who referred this user, for referral attribution.';
COMMENT ON COLUMN users.processing_restricted_at IS 'When data processing was restricted for this user (GDPR right to restrict processing). NULL means no restriction.';
COMMENT ON COLUMN users.bad_faith_reporter_at IS 'Set when the user has an active report-abuse penalty; cleared when all penalties are revoked. Used by computeTrustTier to lower trust tier.';
COMMENT ON COLUMN users.verification_status IS 'Current lifecycle state of the user''s identity verification.';
COMMENT ON COLUMN users.verification_provider IS 'Provider used for verification, set once payment is initiated.';
COMMENT ON COLUMN users.verification_completed_at IS 'Timestamp when verification reached a terminal state (verified, failed, or duplicate_id).';
COMMENT ON COLUMN users.verified_badge_visible IS 'Whether to display the ID-verified badge on this user''s public profile.';
COMMENT ON COLUMN users.public_verified_name_display IS 'How much of the legal name to show publicly.';
COMMENT ON COLUMN users.verified_first_name IS 'Verified legal first name, private unless user opts in.';
COMMENT ON COLUMN users.verified_last_name_initial IS 'Single initial of verified last name, private unless user opts in.';
COMMENT ON COLUMN users.verified_full_name IS 'Verified legal full name, private unless user opts in.';
COMMENT ON COLUMN users.pending_verification_session_id IS 'Stores the Stripe Checkout Session ID during payment_pending, then the Stripe Identity VerificationSession ID during identity_pending; cleared on terminal state.';

COMMENT ON COLUMN users.pending_checkout_session_id IS 'Stripe Checkout Session that initiated the current identity-verification flow. Set when transitioning to identity_pending; cleared on terminal state. Used to recover checkout linkage when Stripe redacts VerificationSession metadata.';
COMMENT ON COLUMN users.profile_image_id IS 'The user''s profile image. NULL if no profile image is set.';
COMMENT ON COLUMN users.individual_id IS 'The real-person individual linked to this user account for personal finance tracking.';

-- ============================================================================
-- engagement email send tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_engagement_email_sends (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type engagement_email_types NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, email_type)
);

CREATE TRIGGER trigger_user_engagement_email_sends_updated_at
BEFORE UPDATE ON user_engagement_email_sends
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_engagement_email_sends IS 'One row per user and one-time engagement email type, used to claim and mark sends exactly once.';
COMMENT ON COLUMN user_engagement_email_sends.user_id IS 'The recipient user.';
COMMENT ON COLUMN user_engagement_email_sends.email_type IS 'The one-time engagement email type.';
COMMENT ON COLUMN user_engagement_email_sends.claimed_at IS 'When the send was first claimed by the dispatcher.';
COMMENT ON COLUMN user_engagement_email_sends.delivery_attempted_at IS 'When delivery of the engagement email was attempted.';
COMMENT ON COLUMN user_engagement_email_sends.sent_at IS 'When the email processor marked the send as delivered.';

-- ============================================================================
-- moderation email send tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_moderation_email_sends (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  send_key TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, send_key)
);

CREATE TRIGGER trigger_user_moderation_email_sends_updated_at
BEFORE UPDATE ON user_moderation_email_sends
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_moderation_email_sends IS 'One row per user and moderation email send key, used to prevent duplicate recurring summary sends.';
COMMENT ON COLUMN user_moderation_email_sends.user_id IS 'The recipient user.';
COMMENT ON COLUMN user_moderation_email_sends.send_key IS 'Recurring cadence key for the moderation summary window.';
COMMENT ON COLUMN user_moderation_email_sends.claimed_at IS 'When the send was first claimed by the dispatcher.';
COMMENT ON COLUMN user_moderation_email_sends.sent_at IS 'When the email processor marked the send as delivered.';

-- ============================================================================
-- email addresses
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_email_addresses (
  user_id UUID REFERENCES users ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  CHECK (char_length(email_address) <= 255),
  CHECK (email_address = LOWER(email_address)),
  CHECK (email_address = TRIM(email_address)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_primary BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_user_email_addresses__user_primary_created_email
  ON user_email_addresses (
    user_id,
    (is_primary::int) DESC,
    created_at ASC,
    email_address ASC
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_addresses_email_primary
  ON user_email_addresses (email_address)
  WHERE is_primary = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_addresses_user_primary
  ON user_email_addresses (user_id)
  WHERE is_primary = TRUE;

CREATE OR REPLACE TRIGGER trigger_user_email_addresses_updated_at
BEFORE UPDATE ON user_email_addresses
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_email_addresses IS 'Email addresses associated with user accounts. Composite PK on (user_id, email_address).';
COMMENT ON COLUMN user_email_addresses.user_id IS 'The user who owns this email address.';
COMMENT ON COLUMN user_email_addresses.email_address IS 'Normalized (lowercase, trimmed) email address.';
COMMENT ON COLUMN user_email_addresses.is_primary IS 'Whether this is the user''s primary email address.';

CREATE TABLE IF NOT EXISTS email_address_login_tokens (
  email_address TEXT NOT NULL,
  CHECK (char_length(email_address) <= 255),
  CHECK (email_address = LOWER(email_address)),
  CHECK (email_address = TRIM(email_address)),
  token TEXT UNIQUE NOT NULL,
  CHECK (char_length(token) <= 255),
  CHECK (token = UPPER(token)),
  CHECK (token = TRIM(token)),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logged_in_at TIMESTAMPTZ,
  -- NULL = login token; non-NULL = email address verification token
  user_id UUID REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (email_address, token)
);

CREATE OR REPLACE TRIGGER trigger_email_address_login_tokens_updated_at
BEFORE UPDATE ON email_address_login_tokens
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- looking up active login tokens by email address and token
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_address_login_tokens_active
ON email_address_login_tokens (email_address, token)
WHERE logged_in_at IS NULL;

-- one pending email verification token per user+email combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_address_login_tokens__user_email_verify
ON email_address_login_tokens (user_id, email_address)
WHERE user_id IS NOT NULL;

-- looking up valid email addresses
CREATE INDEX IF NOT EXISTS idx_email_address_login_tokens__logged_in
  ON email_address_login_tokens (email_address)
  WHERE logged_in_at IS NOT NULL;

-- index for cleanup by created_at
CREATE INDEX IF NOT EXISTS idx_email_address_login_tokens__created_at
  ON email_address_login_tokens (created_at);

-- index for user lookup by email
CREATE INDEX IF NOT EXISTS idx_user_email_addresses__email
  ON user_email_addresses (email_address);

COMMENT ON TABLE email_address_login_tokens IS 'Short-lived tokens for email-based login and email verification flows.';
COMMENT ON COLUMN email_address_login_tokens.email_address IS 'The email address this token was sent to.';
COMMENT ON COLUMN email_address_login_tokens.token IS 'Purpose-bound HMAC-SHA256 hash (uppercase hex) of the verification/login token sent to the user.';
COMMENT ON COLUMN email_address_login_tokens.logged_in_at IS 'When the token was used to log in. NULL means the token is still pending.';
COMMENT ON COLUMN email_address_login_tokens.user_id IS 'Non-NULL for email verification tokens; NULL for login tokens.';

-- ============================================================================
-- phone numbers
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_phone_numbers (
  user_id UUID REFERENCES users ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  CHECK (char_length(phone_number) <= 255),
  CHECK (phone_number = LOWER(phone_number)),
  CHECK (phone_number = TRIM(phone_number)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_primary BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, phone_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone_numbers_phone_primary
  ON user_phone_numbers (phone_number)
  WHERE is_primary = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone_numbers_user_primary
  ON user_phone_numbers (user_id)
  WHERE is_primary = TRUE;

CREATE OR REPLACE TRIGGER trigger_user_phone_numbers_updated_at
BEFORE UPDATE ON user_phone_numbers
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_phone_numbers IS 'Phone numbers associated with user accounts. Composite PK on (user_id, phone_number).';
COMMENT ON COLUMN user_phone_numbers.user_id IS 'The user who owns this phone number.';
COMMENT ON COLUMN user_phone_numbers.phone_number IS 'Normalized (lowercase, trimmed) phone number.';
COMMENT ON COLUMN user_phone_numbers.is_primary IS 'Whether this is the user''s primary phone number.';

CREATE TABLE IF NOT EXISTS phone_number_login_tokens (
  phone_number TEXT NOT NULL,
  CHECK (char_length(phone_number) <= 255),
  CHECK (phone_number = LOWER(phone_number)),
  CHECK (phone_number = TRIM(phone_number)),
  token TEXT UNIQUE NOT NULL,
  CHECK (char_length(token) <= 255),
  CHECK (token = UPPER(token)),
  CHECK (token = TRIM(token)),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logged_in_at TIMESTAMPTZ,
  PRIMARY KEY (phone_number, token)
);

CREATE OR REPLACE TRIGGER trigger_phone_number_login_tokens_updated_at
BEFORE UPDATE ON phone_number_login_tokens
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_number_login_tokens_active
  ON phone_number_login_tokens (phone_number, token)
  WHERE logged_in_at IS NULL;

-- index for cleanup by created_at
CREATE INDEX IF NOT EXISTS idx_phone_number_login_tokens__created_at
ON phone_number_login_tokens (created_at);

-- index for user lookup by phone
CREATE INDEX IF NOT EXISTS idx_user_phone_numbers__phone
ON user_phone_numbers (phone_number);

COMMENT ON TABLE phone_number_login_tokens IS 'Short-lived tokens for phone-number-based login via SMS/voice.';
COMMENT ON COLUMN phone_number_login_tokens.phone_number IS 'The phone number this token was sent to.';
COMMENT ON COLUMN phone_number_login_tokens.token IS 'Purpose-bound HMAC-SHA256 hash (uppercase hex) of the verification token sent to the user.';
COMMENT ON COLUMN phone_number_login_tokens.logged_in_at IS 'When the token was used to log in. NULL means the token is still pending.';

-- ============================================================================
-- authorization (roles & permissions)
-- ============================================================================
-- The granular permission tables are reserved near-term RBAC schema. Runtime authorization still
-- reads role slugs; retain these tables so role-to-permission rollout does not require a redesign.

CREATE TABLE IF NOT EXISTS user_roles_types (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  slug TEXT UNIQUE NOT NULL,
  CHECK (slug = LOWER(slug)),
  CHECK (char_length(slug) <= 255),
  CHECK (slug ~ '^[a-z0-9_]+$'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_user_roles_types_updated_at
BEFORE UPDATE ON user_roles_types
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS user_permission_types (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  slug TEXT UNIQUE NOT NULL,
  CHECK (slug = LOWER(slug)),
  CHECK (char_length(slug) <= 255),
  CHECK (slug ~ '^[a-z0-9_]+$'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_user_permission_types_updated_at
BEFORE UPDATE ON user_permission_types
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS user_role_permissions (
  role_type_id BIGINT REFERENCES user_roles_types ON DELETE CASCADE,
  permission_type_id BIGINT REFERENCES user_permission_types ON DELETE CASCADE,
  PRIMARY KEY (role_type_id, permission_type_id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_user_role_permissions_updated_at
BEFORE UPDATE ON user_role_permissions
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES users ON DELETE CASCADE,
  role_type_id BIGINT REFERENCES user_roles_types ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_type_id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_user_roles_updated_at
BEFORE UPDATE ON user_roles
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_roles__role_type_id ON user_roles (role_type_id);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id UUID REFERENCES users ON DELETE CASCADE,
  permission_type_id BIGINT REFERENCES user_permission_types ON DELETE CASCADE,
  PRIMARY KEY (user_id, permission_type_id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_user_permissions_updated_at
BEFORE UPDATE ON user_permissions
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_roles_types IS 'Lookup table of role types (e.g. administrator) that can be assigned to users.';
COMMENT ON COLUMN user_roles_types.slug IS 'Unique lowercase identifier for this role type.';

COMMENT ON TABLE user_permission_types IS 'Lookup table of granular permission types that can be granted to roles or users.';
COMMENT ON COLUMN user_permission_types.slug IS 'Unique lowercase identifier for this permission type.';

COMMENT ON TABLE user_role_permissions IS 'Join table mapping role types to their granted permission types.';
COMMENT ON COLUMN user_role_permissions.role_type_id IS 'The role type that has this permission.';
COMMENT ON COLUMN user_role_permissions.permission_type_id IS 'The permission type granted to this role.';

COMMENT ON TABLE user_roles IS 'Join table assigning role types to users.';
COMMENT ON COLUMN user_roles.user_id IS 'The user who has this role.';
COMMENT ON COLUMN user_roles.role_type_id IS 'The role type assigned to this user.';

COMMENT ON TABLE user_permissions IS 'Direct permission grants to individual users, bypassing roles.';
COMMENT ON COLUMN user_permissions.user_id IS 'The user who has this permission.';
COMMENT ON COLUMN user_permissions.permission_type_id IS 'The permission type granted to this user.';

INSERT INTO user_roles_types (slug)
VALUES ('administrator'), ('investor'), ('customer_support'), ('moderator'), ('developer')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- meta (facebook)
-- ============================================================================

CREATE TABLE IF NOT EXISTS facebook_accounts (
  -- which user this facebook account is connected to
  -- NOTE: this is nullable because a user can be created after this facebook account data is saved
  user_id UUID REFERENCES users ON DELETE SET NULL,

  -- facebook user ID
  facebook_user_id TEXT PRIMARY KEY,
  facebook_user_email_address TEXT,
  facebook_user_data JSONB NOT NULL, -- from /api/me

  -- long-lived access token (Facebook exchanges short-lived for long-lived server-side)
  access_token_ciphertext TEXT,
  access_token_expires_at TIMESTAMPTZ,

  friends_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_facebook_accounts_updated_at
BEFORE UPDATE ON facebook_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- user ID gets added afterwards
CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_accounts__user_id
ON facebook_accounts (user_id)
WHERE user_id IS NOT NULL;

-- no idea if facebook email addresses are unique per account
CREATE INDEX IF NOT EXISTS idx_facebook_accounts__facebook_user_email_address
ON facebook_accounts (facebook_user_email_address)
WHERE facebook_user_email_address IS NOT NULL;

-- index for cleanup by token expiration
CREATE INDEX IF NOT EXISTS idx_facebook_accounts__token_expires_at
ON facebook_accounts (access_token_expires_at)
WHERE access_token_expires_at IS NOT NULL;

COMMENT ON TABLE facebook_accounts IS 'Facebook OAuth accounts linked to users. Stores profile data and encrypted long-lived access token ciphertext.';
COMMENT ON COLUMN facebook_accounts.user_id IS 'The linked user. NULL if the user account has not been created yet.';
COMMENT ON COLUMN facebook_accounts.facebook_user_id IS 'Facebook''s unique user ID (primary key).';
COMMENT ON COLUMN facebook_accounts.facebook_user_email_address IS 'Email address from the Facebook profile.';
COMMENT ON COLUMN facebook_accounts.facebook_user_data IS 'Raw JSONB profile data from Facebook''s /api/me endpoint.';
COMMENT ON COLUMN facebook_accounts.access_token_ciphertext IS 'Encrypted long-lived Facebook access token ciphertext for API calls.';
COMMENT ON COLUMN facebook_accounts.access_token_expires_at IS 'When the long-lived access token expires.';
COMMENT ON COLUMN facebook_accounts.friends_synced_at IS 'When the user''s Facebook friends list was last synced for friend discovery.';

CREATE TABLE IF NOT EXISTS facebook_friends (
  facebook_user_id TEXT NOT NULL,
  facebook_friend_id TEXT NOT NULL,

  PRIMARY KEY (facebook_user_id, facebook_friend_id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_facebook_friends_updated_at
BEFORE UPDATE ON facebook_friends
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE facebook_friends IS 'Facebook friend relationships between Facebook user IDs.';
COMMENT ON COLUMN facebook_friends.facebook_user_id IS 'The Facebook user ID of the source user.';
COMMENT ON COLUMN facebook_friends.facebook_friend_id IS 'The Facebook user ID of the friend.';

-- ============================================================================
-- passkeys
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_passkeys (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type passkey_device_types NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  transports TEXT[],
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100 AND TRIM(name) = name),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ,
  CONSTRAINT user_passkeys_credential_id_unique UNIQUE (credential_id)
);

CREATE OR REPLACE TRIGGER trigger_user_passkeys_updated_at
  BEFORE UPDATE ON user_passkeys
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_passkeys__user_id ON user_passkeys (user_id);

COMMENT ON TABLE user_passkeys IS 'WebAuthn/FIDO2 passkey credentials registered by users for passwordless authentication.';
COMMENT ON COLUMN user_passkeys.user_id IS 'The user who registered this passkey.';
COMMENT ON COLUMN user_passkeys.credential_id IS 'WebAuthn credential ID, unique across all passkeys.';
COMMENT ON COLUMN user_passkeys.public_key IS 'Public key bytes for signature verification.';
COMMENT ON COLUMN user_passkeys.counter IS 'Signature counter for detecting cloned authenticators.';
COMMENT ON COLUMN user_passkeys.device_type IS 'Whether the passkey is single-device or multi-device (synced).';
COMMENT ON COLUMN user_passkeys.backed_up IS 'Whether the passkey is backed up to the cloud by the authenticator.';
COMMENT ON COLUMN user_passkeys.transports IS 'Supported transport methods (usb, ble, nfc, internal, etc.).';
COMMENT ON COLUMN user_passkeys.name IS 'User-chosen display name for this passkey (1-100 chars).';
COMMENT ON COLUMN user_passkeys.last_used_at IS 'When this passkey was last used for authentication.';

-- ============================================================================
-- session referral attributions
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_referral_attributions (
  id           UUID        PRIMARY KEY DEFAULT uuidv7(),
  session_id   UUID        NOT NULL,
  -- ON DELETE SET NULL: preserve attribution history even if the referrer deletes their account.
  -- A null referrer_id means "referred by a deleted user" — the event still counts for analytics.
  referrer_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- ON DELETE SET NULL: preserve attribution records even if the attributed user deletes their account
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  landing_url  TEXT        NOT NULL,
  CHECK (char_length(landing_url) <= 2048),
  CHECK (referrer_id != user_id),

  -- UTM tracking parameters
  utm_source   TEXT,
  CONSTRAINT chk_sra_utm_source CHECK (utm_source IS NULL OR (char_length(utm_source) <= 255 AND utm_source = LOWER(TRIM(utm_source)))),
  utm_medium   TEXT,
  CONSTRAINT chk_sra_utm_medium CHECK (utm_medium IS NULL OR (char_length(utm_medium) <= 255 AND utm_medium = LOWER(TRIM(utm_medium)))),
  utm_campaign TEXT,
  CONSTRAINT chk_sra_utm_campaign CHECK (utm_campaign IS NULL OR (char_length(utm_campaign) <= 255 AND utm_campaign = LOWER(TRIM(utm_campaign)))),
  utm_content  TEXT,
  CONSTRAINT chk_sra_utm_content CHECK (utm_content IS NULL OR (char_length(utm_content) <= 255 AND utm_content = LOWER(TRIM(utm_content)))),

  signed_up_at TIMESTAMPTZ,

  created_at   TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
) PARTITION BY RANGE (id);

CREATE INDEX IF NOT EXISTS idx_session_referral_attributions__session_id_id
  ON session_referral_attributions (session_id, id);
CREATE INDEX IF NOT EXISTS idx_session_referral_attributions__referrer_id
  ON session_referral_attributions (referrer_id)
  WHERE referrer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_referral_attributions__user_id
  ON session_referral_attributions (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE session_referral_attributions IS 'Tracks which user referred a session, linking anonymous sessions to referrers for attribution. RANGE-partitioned by id with a default partition only; split later by adding explicit range partitions.';
COMMENT ON COLUMN session_referral_attributions.session_id IS 'The anonymous session that was referred. Not a FK — sessions live outside PostgreSQL.';
COMMENT ON COLUMN session_referral_attributions.referrer_id IS 'The user who referred this session. NULL if the referrer deleted their account.';
COMMENT ON COLUMN session_referral_attributions.user_id IS 'The user who signed up from this referral. NULL until signup or if user deletes account.';
COMMENT ON COLUMN session_referral_attributions.landing_url IS 'The URL the referred session landed on (max 2048 chars).';
COMMENT ON COLUMN session_referral_attributions.utm_source IS 'UTM source parameter from the referral URL (e.g. google, newsletter).';
COMMENT ON COLUMN session_referral_attributions.utm_medium IS 'UTM medium parameter from the referral URL (e.g. cpc, email).';
COMMENT ON COLUMN session_referral_attributions.utm_campaign IS 'UTM campaign name from the referral URL.';
COMMENT ON COLUMN session_referral_attributions.utm_content IS 'UTM content parameter, used to differentiate links within the same campaign.';
COMMENT ON COLUMN session_referral_attributions.signed_up_at IS 'When the referred session converted to a signup. NULL until the user registers.';

-- ============================================================================
-- user consents
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE consent_types AS ENUM ('privacy_policy', 'terms_of_service', 'cookie_analytics');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_consents (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type consent_types NOT NULL,
  version TEXT NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  CHECK (char_length(version) BETWEEN 1 AND 50),
  CHECK (version = TRIM(version))
);

CREATE OR REPLACE TRIGGER trigger_user_consents_updated_at
  BEFORE UPDATE ON user_consents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_consents__user_id__unique ON user_consents (user_id, consent_type) WHERE revoked_at IS NULL;

COMMENT ON TABLE user_consents IS 'Records user consent to legal agreements such as privacy policy and terms of service.';
COMMENT ON COLUMN user_consents.user_id IS 'The user who gave consent.';
COMMENT ON COLUMN user_consents.consent_type IS 'Type of consent: privacy_policy, terms_of_service, or cookie_analytics.';
COMMENT ON COLUMN user_consents.version IS 'Version identifier of the agreement the user consented to.';
COMMENT ON COLUMN user_consents.revoked_at IS 'When the user revoked this consent.';

-- ==========================================================================
-- 0002-00-00-oauth-urls.sql
-- ============================================================================

--------------------------------------------------------------------------------
-- OAuth provider accounts
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS apple_accounts (
  user_id UUID REFERENCES users ON DELETE SET NULL,
  apple_user_id TEXT PRIMARY KEY,
  apple_user_email_address TEXT,
  apple_user_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_apple_accounts_updated_at
BEFORE UPDATE ON apple_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_apple_accounts__user_id
ON apple_accounts (user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apple_accounts__email
ON apple_accounts (apple_user_email_address)
WHERE apple_user_email_address IS NOT NULL;

COMMENT ON TABLE apple_accounts IS 'Apple Sign In accounts linked to users. Stores Apple profile data.';
COMMENT ON COLUMN apple_accounts.user_id IS 'The linked user. NULL if the user account has not been created yet.';
COMMENT ON COLUMN apple_accounts.apple_user_id IS 'Apple''s unique user identifier (primary key).';
COMMENT ON COLUMN apple_accounts.apple_user_email_address IS 'Email address from the Apple profile.';
COMMENT ON COLUMN apple_accounts.apple_user_data IS 'Raw JSONB profile data from Apple Sign In.';

CREATE TABLE IF NOT EXISTS google_accounts (
  user_id UUID REFERENCES users ON DELETE SET NULL,
  google_user_id TEXT PRIMARY KEY,
  google_user_email_address TEXT,
  google_user_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_google_accounts_updated_at
BEFORE UPDATE ON google_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_accounts__user_id
ON google_accounts (user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_google_accounts__email
ON google_accounts (google_user_email_address)
WHERE google_user_email_address IS NOT NULL;

COMMENT ON TABLE google_accounts IS 'Google OAuth accounts linked to users. Stores Google profile data.';
COMMENT ON COLUMN google_accounts.user_id IS 'The linked user. NULL if the user account has not been created yet.';
COMMENT ON COLUMN google_accounts.google_user_id IS 'Google''s unique user identifier (primary key).';
COMMENT ON COLUMN google_accounts.google_user_email_address IS 'Email address from the Google profile.';
COMMENT ON COLUMN google_accounts.google_user_data IS 'Raw JSONB profile data from Google OAuth.';

CREATE TABLE IF NOT EXISTS x_accounts (
  user_id UUID REFERENCES users ON DELETE SET NULL,
  x_user_id TEXT PRIMARY KEY,
  x_user_email_address TEXT,
  x_user_data JSONB NOT NULL,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  access_token_expires_at TIMESTAMPTZ,
  friends_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_x_accounts_updated_at
BEFORE UPDATE ON x_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_x_accounts__user_id
ON x_accounts (user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_x_accounts__token_expires_at
ON x_accounts (access_token_expires_at)
WHERE access_token_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_x_accounts__friends_synced_at
ON x_accounts (friends_synced_at)
WHERE user_id IS NOT NULL AND access_token_ciphertext IS NOT NULL;

COMMENT ON TABLE x_accounts IS 'X (Twitter) OAuth accounts linked to users. Stores profile data and encrypted OAuth token ciphertext.';
COMMENT ON COLUMN x_accounts.user_id IS 'The linked user. NULL if the user account has not been created yet.';
COMMENT ON COLUMN x_accounts.x_user_id IS 'X''s unique user identifier (primary key).';
COMMENT ON COLUMN x_accounts.x_user_email_address IS 'Email address from the X profile.';
COMMENT ON COLUMN x_accounts.x_user_data IS 'Raw JSONB profile data from X OAuth.';
COMMENT ON COLUMN x_accounts.access_token_ciphertext IS 'Encrypted OAuth 2.0 access token ciphertext for X API calls.';
COMMENT ON COLUMN x_accounts.refresh_token_ciphertext IS 'Encrypted OAuth 2.0 refresh token ciphertext for renewing access.';
COMMENT ON COLUMN x_accounts.access_token_expires_at IS 'When the access token expires.';
COMMENT ON COLUMN x_accounts.friends_synced_at IS 'When the user''s X (Twitter) friends list was last synced for friend discovery.';

CREATE TABLE IF NOT EXISTS linkedin_accounts (
  user_id UUID REFERENCES users ON DELETE SET NULL,
  linkedin_user_id TEXT PRIMARY KEY,
  linkedin_user_email_address TEXT,
  linkedin_user_data JSONB NOT NULL,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  access_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_linkedin_accounts_updated_at
BEFORE UPDATE ON linkedin_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_accounts__user_id
ON linkedin_accounts (user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linkedin_accounts__email
ON linkedin_accounts (linkedin_user_email_address)
WHERE linkedin_user_email_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linkedin_accounts__token_expires_at
ON linkedin_accounts (access_token_expires_at)
WHERE access_token_expires_at IS NOT NULL;

COMMENT ON TABLE linkedin_accounts IS 'LinkedIn OAuth accounts linked to users. Stores profile data and encrypted OAuth token ciphertext.';
COMMENT ON COLUMN linkedin_accounts.user_id IS 'The linked user. NULL if the user account has not been created yet.';
COMMENT ON COLUMN linkedin_accounts.linkedin_user_id IS 'LinkedIn''s unique user identifier (primary key).';
COMMENT ON COLUMN linkedin_accounts.linkedin_user_email_address IS 'Email address from the LinkedIn profile.';
COMMENT ON COLUMN linkedin_accounts.linkedin_user_data IS 'Raw JSONB profile data from LinkedIn OAuth.';
COMMENT ON COLUMN linkedin_accounts.access_token_ciphertext IS 'Encrypted OAuth 2.0 access token ciphertext for LinkedIn API calls.';
COMMENT ON COLUMN linkedin_accounts.refresh_token_ciphertext IS 'Encrypted OAuth 2.0 refresh token ciphertext for renewing access.';
COMMENT ON COLUMN linkedin_accounts.access_token_expires_at IS 'When the access token expires.';

CREATE TABLE IF NOT EXISTS microsoft_accounts (
  user_id UUID REFERENCES users ON DELETE SET NULL,
  microsoft_user_id TEXT PRIMARY KEY,
  microsoft_user_email_address TEXT,
  microsoft_user_data JSONB NOT NULL,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  access_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_microsoft_accounts_updated_at
BEFORE UPDATE ON microsoft_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_microsoft_accounts__user_id
ON microsoft_accounts (user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_microsoft_accounts__email
ON microsoft_accounts (microsoft_user_email_address)
WHERE microsoft_user_email_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_microsoft_accounts__token_expires_at
ON microsoft_accounts (access_token_expires_at)
WHERE access_token_expires_at IS NOT NULL;

COMMENT ON TABLE microsoft_accounts IS 'Microsoft OAuth accounts linked to users. Stores profile data and encrypted OAuth token ciphertext.';
COMMENT ON COLUMN microsoft_accounts.user_id IS 'The linked user. NULL if the user account has not been created yet.';
COMMENT ON COLUMN microsoft_accounts.microsoft_user_id IS 'Microsoft''s unique user identifier (primary key).';
COMMENT ON COLUMN microsoft_accounts.microsoft_user_email_address IS 'Email address from the Microsoft profile.';
COMMENT ON COLUMN microsoft_accounts.microsoft_user_data IS 'Raw JSONB profile data from Microsoft OAuth.';
COMMENT ON COLUMN microsoft_accounts.access_token_ciphertext IS 'Encrypted OAuth 2.0 access token ciphertext for Microsoft API calls.';
COMMENT ON COLUMN microsoft_accounts.refresh_token_ciphertext IS 'Encrypted OAuth 2.0 refresh token ciphertext for renewing access.';
COMMENT ON COLUMN microsoft_accounts.access_token_expires_at IS 'When the access token expires.';

-- ============================================================================
-- Aside preferences and curated aside items
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_aside_preferences (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  aside_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uc_user_aside_preferences__user_aside UNIQUE (user_id, aside_key)
);

CREATE TABLE IF NOT EXISTS curated_aside_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID,
  rss_feed_id UUID,
  community_id UUID,
  aside_type TEXT GENERATED ALWAYS AS (
    CASE
      WHEN topic_id IS NOT NULL THEN 'topic'
      WHEN rss_feed_id IS NOT NULL THEN 'source'
      WHEN community_id IS NOT NULL THEN 'community'
    END
  ) STORED,
  entity_id UUID GENERATED ALWAYS AS (COALESCE(topic_id, rss_feed_id, community_id)) STORED,
  position SMALLINT NOT NULL DEFAULT 0,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_curated_aside_items__one_target
    CHECK (num_nonnulls(topic_id, rss_feed_id, community_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uc_curated_aside_items__type_entity
ON curated_aside_items (aside_type, entity_id)
WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_curated_aside_items__topic_id
ON curated_aside_items (topic_id)
WHERE topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_curated_aside_items__rss_feed_id
ON curated_aside_items (rss_feed_id)
WHERE rss_feed_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_curated_aside_items__community_id
ON curated_aside_items (community_id)
WHERE community_id IS NOT NULL;

COMMENT ON TABLE user_aside_preferences IS 'Tracks which sidebar asides a user has dismissed.';
COMMENT ON COLUMN user_aside_preferences.user_id IS 'The user who dismissed the aside.';
COMMENT ON COLUMN user_aside_preferences.aside_key IS 'Stable string key identifying the aside panel (e.g. trending-topics).';
COMMENT ON COLUMN user_aside_preferences.dismissed_at IS 'When the user last dismissed this aside.';

COMMENT ON TABLE curated_aside_items IS 'Admin-curated entities surfaced in sidebar aside panels.';
COMMENT ON COLUMN curated_aside_items.topic_id IS 'Curated topic target; exactly one target FK is set.';
COMMENT ON COLUMN curated_aside_items.rss_feed_id IS 'Curated source target; exactly one target FK is set.';
COMMENT ON COLUMN curated_aside_items.community_id IS 'Curated community target; exactly one target FK is set.';
COMMENT ON COLUMN curated_aside_items.aside_type IS 'Wire-compatible target discriminator derived from the concrete target FK.';
COMMENT ON COLUMN curated_aside_items.entity_id IS 'Wire-compatible target UUID derived from the concrete target FK.';
COMMENT ON COLUMN curated_aside_items.position IS 'Display order within the aside type; lower values appear first.';
COMMENT ON COLUMN curated_aside_items.created_by_id IS 'Admin who curated the item; NULL when that user has been deleted.';

-- Partial indexes supporting orphaned OAuth account retention cleanup:
-- WHERE user_id IS NULL AND created_at is older than the retention cutoff
-- ORDER BY created_at ASC, <provider_user_id> ASC
CREATE INDEX IF NOT EXISTS idx_facebook_accounts__orphan_retention_cleanup
ON facebook_accounts (created_at, facebook_user_id)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_apple_accounts__orphan_retention_cleanup
ON apple_accounts (created_at, apple_user_id)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_google_accounts__orphan_retention_cleanup
ON google_accounts (created_at, google_user_id)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_x_accounts__orphan_retention_cleanup
ON x_accounts (created_at, x_user_id)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_linkedin_accounts__orphan_retention_cleanup
ON linkedin_accounts (created_at, linkedin_user_id)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_microsoft_accounts__orphan_retention_cleanup
ON microsoft_accounts (created_at, microsoft_user_id)
WHERE user_id IS NULL;
