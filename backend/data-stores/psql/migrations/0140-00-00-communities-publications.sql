-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added ban-evasion detection columns to community_members
-- edited-in-place: added default_language and language detection columns
-- edited-in-place: folded idx_comm_post_reviews__approved_visible, idx_comm_post_reviews__user_removed from 0430-00-00-automod-simulation-indexes
-- edited-in-place: swapped 'english' to 'voucha_english' text search config (unaccent support)
-- Merged from: 0200-00-00-communities.sql, 0210-00-00-community-agent-prompts.sql, 0340-00-00-community-list-type.sql, 0360-00-00-community-application-message.sql, 0370-00-00-community-posts-enabled.sql, 0390-00-00-report-judgements.sql (rules_markdown)

-- ==========================================================================
-- 0200-00-00-communities.sql
-- ============================================================================

-- Community visibility types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_visibility_types') THEN
    CREATE TYPE community_visibility_types AS ENUM ('public', 'private');
  END IF;
END $$;

-- Community member roles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_member_roles') THEN
    CREATE TYPE community_member_roles AS ENUM ('owner', 'moderator', 'member');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_member_roster_visibility_types') THEN
    CREATE TYPE community_member_roster_visibility_types AS ENUM ('public', 'users', 'members', 'moderators');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_list_types') THEN
    CREATE TYPE community_list_types AS ENUM ('follow', 'mute');
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE community_application_question_field_types AS ENUM (
    'short_text',
    'long_text',
    'single_select',
    'multi_select',
    'checkbox'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- communities
CREATE TABLE IF NOT EXISTS communities (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  created_via content_creation_channels,
  created_via_oauth_client_id UUID,
  CONSTRAINT communities_created_via_oauth_client_id_check CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp'))),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  markdown TEXT,
  visibility community_visibility_types NOT NULL DEFAULT 'public',
  member_roster_visibility community_member_roster_visibility_types NOT NULL DEFAULT 'public',
  member_invites_allowed_at TIMESTAMPTZ,
  post_approval_required_at TIMESTAMPTZ,
  allow_review_posts BOOLEAN NOT NULL DEFAULT false,
  allow_data_point_posts BOOLEAN NOT NULL DEFAULT false,
  trusted_at TIMESTAMPTZ,
  profile_image_id UUID REFERENCES images ON DELETE SET NULL,
  banner_image_id UUID REFERENCES images ON DELETE SET NULL,
  created_by_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('voucha_english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('voucha_english', COALESCE(slug, '')), 'A') ||
    setweight(to_tsvector('voucha_english', COALESCE(markdown, '')), 'B')
  ) STORED,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  archived_by_id UUID REFERENCES users ON DELETE SET NULL,
  list_type community_list_types,
  default_language TEXT CHECK (default_language IS NULL OR (default_language = LOWER(default_language) AND LENGTH(default_language) <= 10)),
  lingua_rs_detected_language TEXT CHECK (lingua_rs_detected_language IS NULL OR (lingua_rs_detected_language = LOWER(lingua_rs_detected_language) AND LENGTH(lingua_rs_detected_language) <= 10)),
  lingua_rs_content_sha256 BYTEA CHECK (lingua_rs_content_sha256 IS NULL OR LENGTH(lingua_rs_content_sha256) = 32),
  lingua_rs_input_sha256 BYTEA CHECK (lingua_rs_input_sha256 IS NULL OR LENGTH(lingua_rs_input_sha256) = 32),
  lingua_rs_results JSONB,
  lingua_rs_detected_at TIMESTAMPTZ,
  rules_markdown TEXT CHECK (rules_markdown IS NULL OR char_length(rules_markdown) <= 10000),
  CHECK (name = TRIM(name)),
  CHECK (char_length(name) BETWEEN 1 AND 100),
  CHECK (slug = LOWER(slug)),
  CHECK (slug = TRIM(slug)),
  CHECK (char_length(slug) BETWEEN 1 AND 80),
  CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE OR REPLACE TRIGGER trigger_communities_updated_at
  BEFORE UPDATE ON communities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_communities__slug ON communities (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities__archived_at ON communities (archived_at) WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities__created_by_id ON communities (created_by_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities__profile_image ON communities (profile_image_id) WHERE profile_image_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities__banner_image ON communities (banner_image_id) WHERE banner_image_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities__search ON communities USING GIN (search_vector) WHERE deleted_at IS NULL;

-- RI-usable indexes for FKs whose existing indexes above carry additional predicates
CREATE INDEX IF NOT EXISTS idx_communities__created_by_id_bare ON communities (created_by_id);
CREATE INDEX IF NOT EXISTS idx_communities__profile_image_id_bare ON communities (profile_image_id) WHERE profile_image_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communities__banner_image_id_bare ON communities (banner_image_id) WHERE banner_image_id IS NOT NULL;

-- RI-usable indexes for the SET NULL audit-column FKs (communities is a large-audit table)
CREATE INDEX IF NOT EXISTS idx_communities__deleted_by_id ON communities (deleted_by_id) WHERE deleted_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communities__archived_by_id ON communities (archived_by_id) WHERE archived_by_id IS NOT NULL;

-- find communities pending language detection
CREATE INDEX IF NOT EXISTS communities_lingua_rs_pending_idx
  ON communities (id)
  WHERE lingua_rs_input_sha256 IS NULL;

COMMENT ON TABLE communities IS 'User-created communities that group posts and members around a shared interest.';
COMMENT ON COLUMN communities.name IS 'Display name of the community.';
COMMENT ON COLUMN communities.slug IS 'URL-safe lowercase identifier, unique among active communities.';
COMMENT ON COLUMN communities.markdown IS 'Community description in Markdown format.';
COMMENT ON COLUMN communities.visibility IS 'Whether the community is publicly discoverable or private.';
COMMENT ON COLUMN communities.member_roster_visibility IS 'Who can see regular member rows in the community roster. Owners and moderators are always public to viewers who can see the community.';
COMMENT ON COLUMN communities.member_invites_allowed_at IS 'When set, existing members can invite new members (not just owners/moderators). NULL means only owners/moderators can invite.';
COMMENT ON COLUMN communities.post_approval_required_at IS 'When set, posts must be approved by a moderator before becoming visible. NULL means no approval required.';
COMMENT ON COLUMN communities.allow_review_posts IS 'When true, active community members can create review posts in this community.';
COMMENT ON COLUMN communities.allow_data_point_posts IS 'When true, active community members can create data point posts in this community.';
COMMENT ON COLUMN communities.trusted_at IS 'When set, posts in this community bypass the clearance pending gate and are immediately visible. NULL means standard clearance flow.';
COMMENT ON COLUMN communities.profile_image_id IS 'Optional avatar/logo image for the community.';
COMMENT ON COLUMN communities.banner_image_id IS 'Optional banner image displayed on the community page.';
COMMENT ON COLUMN communities.archived_at IS 'When set, the community is archived and read-only.';
COMMENT ON COLUMN communities.archived_by_id IS 'User who archived the community.';
COMMENT ON COLUMN communities.default_language IS 'Default ISO 639-1 language for community content';
COMMENT ON COLUMN communities.rules_markdown IS 'Community-drafted moderation rules read by the AI report-judgement agent.';

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__community_id
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
  NOT VALID;
ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__community_id;
CREATE INDEX IF NOT EXISTS idx_notifications__community_id
  ON notifications (community_id)
  WHERE community_id IS NOT NULL;
COMMENT ON COLUMN notifications.community_id IS 'Community associated with a community lifecycle notification.';

-- community_members
CREATE TABLE IF NOT EXISTS community_members (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  role community_member_roles NOT NULL DEFAULT 'member',
  suppress_community_digests_while_on_vacation BOOLEAN NOT NULL DEFAULT false,
  approved_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL,
  suspected_ban_evader_at TIMESTAMPTZ,
  suspected_ban_evader_source_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  suspected_ban_evader_score NUMERIC(4,3),
  suspected_ban_evader_dismissed_at TIMESTAMPTZ,
  suspected_ban_evader_dismissed_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_community_members_updated_at
  BEFORE UPDATE ON community_members FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_members__uniq ON community_members (community_id, user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_community_members__user_id_desc
  ON community_members (user_id, id DESC)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_community_members__suspected_evasion
  ON community_members (community_id, suspected_ban_evader_at DESC)
  WHERE suspected_ban_evader_at IS NOT NULL
    AND suspected_ban_evader_dismissed_at IS NULL
    AND removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_community_members__departed
  ON community_members (community_id, removed_at) WHERE removed_at IS NOT NULL;

-- RI-usable indexes for FKs whose existing indexes above carry predicates on other columns
CREATE INDEX IF NOT EXISTS idx_community_members__community_id ON community_members (community_id);
CREATE INDEX IF NOT EXISTS idx_community_members__user_id_id ON community_members (user_id, id);
CREATE INDEX IF NOT EXISTS idx_community_members__suspected_ban_evader_source_user_id
  ON community_members (suspected_ban_evader_source_user_id)
  WHERE suspected_ban_evader_source_user_id IS NOT NULL;

COMMENT ON TABLE community_members IS 'Tracks membership of users in communities with role-based access control.';
COMMENT ON COLUMN community_members.community_id IS 'The community this membership belongs to.';
COMMENT ON COLUMN community_members.user_id IS 'The user who is a member.';
COMMENT ON COLUMN community_members.role IS 'Member role: owner, moderator, or member.';
COMMENT ON COLUMN community_members.suppress_community_digests_while_on_vacation IS 'Whether community digest delivery is paused while this membership has an active moderator vacation.';
COMMENT ON COLUMN community_members.approved_by_id IS 'Moderator or owner who approved this membership, if approval was required.';
COMMENT ON COLUMN community_members.removed_at IS 'When set, the member has been removed from the community.';
COMMENT ON COLUMN community_members.removed_by_id IS 'User who removed this member.';
COMMENT ON COLUMN community_members.suspected_ban_evader_at IS 'When set, the member has been flagged as a suspected ban evader.';
COMMENT ON COLUMN community_members.suspected_ban_evader_source_user_id IS 'The banned user whose posts closely match this member''s posts.';
COMMENT ON COLUMN community_members.suspected_ban_evader_score IS 'Combined signal score (0-1) that triggered the ban-evasion flag.';
COMMENT ON COLUMN community_members.suspected_ban_evader_dismissed_at IS 'When set, the ban-evasion flag has been dismissed by a moderator.';
COMMENT ON COLUMN community_members.suspected_ban_evader_dismissed_by_id IS 'Moderator who dismissed the ban-evasion flag.';

-- community_application_questions
CREATE TABLE IF NOT EXISTS community_application_questions (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  question TEXT NOT NULL,
  field_type community_application_question_field_types NOT NULL DEFAULT 'short_text',
  order_index SMALLINT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  deleted_at TIMESTAMPTZ,
  CHECK (question = TRIM(question)),
  CHECK (char_length(question) BETWEEN 1 AND 500),
  CONSTRAINT community_application_questions_identity_key UNIQUE (community_id, id, field_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_app_q__comm_order ON community_application_questions (community_id, order_index) WHERE deleted_at IS NULL;

COMMENT ON TABLE community_application_questions IS 'Configurable questions shown to users applying to join a community.';
COMMENT ON COLUMN community_application_questions.community_id IS 'The community this question belongs to.';
COMMENT ON COLUMN community_application_questions.question IS 'The question text shown to applicants.';
COMMENT ON COLUMN community_application_questions.field_type IS 'Input type: short_text, long_text, single_select, multi_select, or checkbox.';
COMMENT ON COLUMN community_application_questions.order_index IS 'Display order of this question within the application form.';
COMMENT ON COLUMN community_application_questions.required IS 'Whether the applicant must answer this question.';

-- community_application_question_options
CREATE TABLE IF NOT EXISTS community_application_question_options (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL,
  question_id UUID NOT NULL,
  question_field_type community_application_question_field_types NOT NULL,
  label TEXT NOT NULL,
  order_index SMALLINT NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT community_application_question_options_question_fkey
    FOREIGN KEY (community_id, question_id, question_field_type)
    REFERENCES community_application_questions (community_id, id, field_type) ON DELETE CASCADE,
  CONSTRAINT community_application_question_options_select_type_check
    CHECK (question_field_type IN ('single_select', 'multi_select')),
  CONSTRAINT community_application_question_options_label_check
    CHECK (label = TRIM(label) AND char_length(label) BETWEEN 1 AND 500),
  CONSTRAINT community_application_question_options_order_index_check CHECK (order_index >= 0),
  CONSTRAINT community_application_question_options_identity_key
    UNIQUE (id, community_id, question_id, question_field_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_app_question_options__active_label
  ON community_application_question_options (question_id, label) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_app_question_options__active_order
  ON community_application_question_options (question_id, order_index) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comm_app_question_options__owner
  ON community_application_question_options (community_id, question_id, question_field_type);

COMMENT ON TABLE community_application_question_options IS 'Ordered selectable labels for a community application question, retained with soft-deleted questions for historical answers.';
COMMENT ON COLUMN community_application_question_options.community_id IS 'Community that owns the question, copied so an option cannot move to another community.';
COMMENT ON COLUMN community_application_question_options.question_id IS 'Question whose active choices include this label.';
COMMENT ON COLUMN community_application_question_options.question_field_type IS 'Select field type copied into the ownership foreign key so options cannot belong to scalar questions.';
COMMENT ON COLUMN community_application_question_options.label IS 'The label returned by the API and stored by reference in selected answers.';
COMMENT ON COLUMN community_application_question_options.order_index IS 'Display order within the owning question.';

-- community_applications
CREATE TABLE IF NOT EXISTS community_applications (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  created_via content_creation_channels,
  created_via_oauth_client_id UUID,
  CONSTRAINT community_applications_created_via_oauth_client_id_check CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp'))),
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_id UUID REFERENCES users ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  message TEXT,
  CHECK (message IS NULL OR char_length(message) <= 5000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL)),
  CHECK ((approved_at IS NULL AND rejected_at IS NULL) OR reviewed_at IS NOT NULL),
  CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  CHECK (rejection_reason IS NULL OR rejection_reason = TRIM(rejection_reason)),
  CONSTRAINT community_applications_identity_key UNIQUE (community_id, id)
);

CREATE OR REPLACE TRIGGER trigger_community_applications_updated_at
  BEFORE UPDATE ON community_applications
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_apps__pending ON community_applications (community_id, user_id) WHERE approved_at IS NULL AND rejected_at IS NULL;

-- RI-usable index for the user_id FK. community_applications_identity_key already leads with community_id;
-- the pending unique index is partial, so it is not RI-usable.
CREATE INDEX IF NOT EXISTS idx_community_applications__user_id ON community_applications (user_id);

COMMENT ON TABLE community_applications IS 'Membership applications submitted by users to join a community.';
COMMENT ON COLUMN community_applications.community_id IS 'The community being applied to.';
COMMENT ON COLUMN community_applications.user_id IS 'The user who submitted the application.';
COMMENT ON COLUMN community_applications.reviewed_at IS 'When a moderator reviewed the application.';
COMMENT ON COLUMN community_applications.reviewed_by_id IS 'Moderator who reviewed the application.';
COMMENT ON COLUMN community_applications.approved_at IS 'When the application was approved. Mutually exclusive with rejected_at.';
COMMENT ON COLUMN community_applications.rejected_at IS 'When the application was rejected. Mutually exclusive with approved_at.';
COMMENT ON COLUMN community_applications.rejection_reason IS 'Optional reason provided to the applicant on rejection.';
COMMENT ON COLUMN community_applications.message IS 'Optional freeform message from the applicant when submitting an application.';

-- community_application_answers
CREATE TABLE IF NOT EXISTS community_application_answers (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  application_id UUID NOT NULL,
  community_id UUID NOT NULL,
  question_id UUID NOT NULL,
  question_field_type community_application_question_field_types NOT NULL,
  is_null BOOLEAN NOT NULL,
  text_value TEXT,
  boolean_value BOOLEAN,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT community_application_answers_application_fkey
    FOREIGN KEY (community_id, application_id)
    REFERENCES community_applications (community_id, id) ON DELETE CASCADE,
  CONSTRAINT community_application_answers_question_fkey
    FOREIGN KEY (community_id, question_id, question_field_type)
    REFERENCES community_application_questions (community_id, id, field_type) ON DELETE CASCADE,
  CONSTRAINT community_application_answers_typed_value_check CHECK (
    (is_null AND text_value IS NULL AND boolean_value IS NULL)
    OR (
      NOT is_null
      AND question_field_type IN ('short_text', 'long_text')
      AND text_value IS NOT NULL
      AND boolean_value IS NULL
    )
    OR (
      NOT is_null
      AND question_field_type = 'checkbox'
      AND text_value IS NULL
      AND boolean_value IS NOT NULL
    )
    OR (
      NOT is_null
      AND question_field_type IN ('single_select', 'multi_select')
      AND text_value IS NULL
      AND boolean_value IS NULL
    )
  ),
  CONSTRAINT community_application_answers_question_key UNIQUE (application_id, question_id),
  CONSTRAINT community_application_answers_identity_key
    UNIQUE (id, application_id, community_id, question_id, question_field_type)
);

CREATE INDEX IF NOT EXISTS idx_comm_app_answers__application
  ON community_application_answers (community_id, application_id);
CREATE INDEX IF NOT EXISTS idx_comm_app_answers__question
  ON community_application_answers (community_id, question_id, question_field_type);

COMMENT ON TABLE community_application_answers IS 'One typed, presence-bearing answer for each question supplied with a community application.';
COMMENT ON COLUMN community_application_answers.application_id IS 'Application that supplied this answer.';
COMMENT ON COLUMN community_application_answers.community_id IS 'Community that owns both the application and the question.';
COMMENT ON COLUMN community_application_answers.question_id IS 'Question this answer responds to, including a soft-deleted historical question.';
COMMENT ON COLUMN community_application_answers.question_field_type IS 'Question field type copied into the ownership foreign key so the value columns match the question.';
COMMENT ON COLUMN community_application_answers.is_null IS 'Distinguishes an explicit null from omitted answers and from present empty values.';
COMMENT ON COLUMN community_application_answers.text_value IS 'Present text value, including the empty string, for short_text and long_text questions.';
COMMENT ON COLUMN community_application_answers.boolean_value IS 'Present boolean value, including false, for checkbox questions.';

-- community_application_answer_selections
CREATE TABLE IF NOT EXISTS community_application_answer_selections (
  application_answer_id UUID NOT NULL,
  application_id UUID NOT NULL,
  community_id UUID NOT NULL,
  question_id UUID NOT NULL,
  question_field_type community_application_question_field_types NOT NULL,
  option_id UUID NOT NULL,
  order_index SMALLINT NOT NULL,
  CONSTRAINT community_application_answer_selections_pkey
    PRIMARY KEY (application_answer_id, option_id),
  CONSTRAINT community_application_answer_selections_answer_fkey
    FOREIGN KEY (
      application_answer_id,
      application_id,
      community_id,
      question_id,
      question_field_type
    ) REFERENCES community_application_answers (
      id,
      application_id,
      community_id,
      question_id,
      question_field_type
    ) ON DELETE CASCADE,
  CONSTRAINT community_application_answer_selections_option_fkey
    FOREIGN KEY (option_id, community_id, question_id, question_field_type)
    REFERENCES community_application_question_options (
      id,
      community_id,
      question_id,
      question_field_type
    ) ON DELETE CASCADE,
  CONSTRAINT community_application_answer_selections_type_check
    CHECK (question_field_type IN ('single_select', 'multi_select')),
  CONSTRAINT community_application_answer_selections_order_check CHECK (order_index >= 0),
  CONSTRAINT community_application_answer_selections_order_key
    UNIQUE (application_answer_id, order_index)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_app_answer_selections__single
  ON community_application_answer_selections (application_answer_id)
  WHERE question_field_type = 'single_select';
CREATE INDEX IF NOT EXISTS idx_comm_app_answer_selections__option
  ON community_application_answer_selections (option_id, community_id, question_id, question_field_type);

COMMENT ON TABLE community_application_answer_selections IS 'Ordered selected options for select-type community application answers.';
COMMENT ON COLUMN community_application_answer_selections.application_answer_id IS 'Answer whose selected labels these rows reconstruct.';
COMMENT ON COLUMN community_application_answer_selections.application_id IS 'Application copied from the answer so the selection cannot move to another application.';
COMMENT ON COLUMN community_application_answer_selections.community_id IS 'Community copied from the answer and option so both parents belong to the same community.';
COMMENT ON COLUMN community_application_answer_selections.question_id IS 'Question copied from the answer and option so a selection cannot use another question''s option.';
COMMENT ON COLUMN community_application_answer_selections.question_field_type IS 'Select field type copied from the answer and option.';
COMMENT ON COLUMN community_application_answer_selections.option_id IS 'Option row whose label is returned for this selection, including after that option is soft-deleted.';
COMMENT ON COLUMN community_application_answer_selections.order_index IS 'Applicant-supplied selection order for reconstructing multi-select answers.';

CREATE OR REPLACE FUNCTION fn_assert_community_application_answer_selection_state(checked_answer_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM community_application_answers answer
    WHERE answer.id = checked_answer_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM community_application_answers answer
    WHERE answer.id = checked_answer_id
      AND (
        (
          answer.is_null
          AND EXISTS (
            SELECT 1
            FROM community_application_answer_selections selected
            WHERE selected.application_answer_id = answer.id
          )
        )
        OR (
          NOT answer.is_null
          AND answer.question_field_type = 'single_select'
          AND (
            SELECT count(*)
            FROM community_application_answer_selections selected
            WHERE selected.application_answer_id = answer.id
          ) <> 1
        )
      )
  ) THEN
    RAISE EXCEPTION 'invalid community application answer selection state'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_assert_community_application_answer_from_answer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM fn_assert_community_application_answer_selection_state(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_assert_community_application_answer_from_selection()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM fn_assert_community_application_answer_selection_state(NEW.application_answer_id);
  END IF;

  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE'
    AND NEW.application_answer_id IS DISTINCT FROM OLD.application_answer_id
  ) THEN
    PERFORM fn_assert_community_application_answer_selection_state(OLD.application_answer_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_comm_app_answers_selection_state ON community_application_answers;
CREATE CONSTRAINT TRIGGER trigger_comm_app_answers_selection_state
  AFTER INSERT OR UPDATE OR DELETE ON community_application_answers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION fn_assert_community_application_answer_from_answer();

DROP TRIGGER IF EXISTS trigger_comm_app_answer_selections_state ON community_application_answer_selections;
CREATE CONSTRAINT TRIGGER trigger_comm_app_answer_selections_state
  AFTER INSERT OR UPDATE OR DELETE ON community_application_answer_selections
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION fn_assert_community_application_answer_from_selection();

-- community_invites
CREATE TABLE IF NOT EXISTS community_invites (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  code TEXT NOT NULL,
  invited_user_id UUID REFERENCES users ON DELETE CASCADE,
  invited_email TEXT,
  invited_by_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users ON DELETE SET NULL,
  declined_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (invited_user_id IS NOT NULL OR invited_email IS NOT NULL),
  CHECK (NOT (accepted_at IS NOT NULL AND declined_at IS NOT NULL)),
  CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)),
  CHECK (NOT (declined_at IS NOT NULL AND revoked_at IS NOT NULL)),
  CHECK (code = LOWER(code)),
  CHECK (code = TRIM(code)),
  CHECK (char_length(code) = 8),
  CHECK (invited_email IS NULL OR invited_email = LOWER(TRIM(invited_email))),
  CHECK (invited_email IS NULL OR char_length(invited_email) <= 320)
);

CREATE OR REPLACE TRIGGER trigger_community_invites_updated_at
  BEFORE UPDATE ON community_invites
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_invites__code ON community_invites (code) WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_invites__user ON community_invites (community_id, invited_user_id) WHERE invited_user_id IS NOT NULL AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;

-- RI-usable indexes for FKs whose existing indexes above carry additional predicates or lead with a different column
CREATE INDEX IF NOT EXISTS idx_community_invites__community_id ON community_invites (community_id);
CREATE INDEX IF NOT EXISTS idx_community_invites__invited_user_id ON community_invites (invited_user_id) WHERE invited_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_invites__invited_by_id ON community_invites (invited_by_id);
CREATE INDEX IF NOT EXISTS idx_community_invites__accepted_by_user_id ON community_invites (accepted_by_user_id) WHERE accepted_by_user_id IS NOT NULL;

COMMENT ON TABLE community_invites IS 'Invitations to join a community, sent to a specific user or email address.';
COMMENT ON COLUMN community_invites.community_id IS 'The community the invite is for.';
COMMENT ON COLUMN community_invites.code IS 'Unique 8-character lowercase invite code.';
COMMENT ON COLUMN community_invites.invited_user_id IS 'Target user, if inviting an existing user.';
COMMENT ON COLUMN community_invites.invited_email IS 'Target email address, if inviting someone who may not have an account.';
COMMENT ON COLUMN community_invites.invited_by_id IS 'User who created the invitation.';
COMMENT ON COLUMN community_invites.accepted_at IS 'When the invite was accepted.';
COMMENT ON COLUMN community_invites.accepted_by_user_id IS 'User who accepted the invite (may differ from invited_user_id for email invites).';
COMMENT ON COLUMN community_invites.declined_at IS 'When the invite was declined.';
COMMENT ON COLUMN community_invites.revoked_at IS 'When the invite was revoked by the inviter or a moderator.';

-- community_post_reviews
-- This app has not launched, so the community publications baseline is
-- intentionally replaced in place instead of carrying an upgrade migration.
CREATE TABLE IF NOT EXISTS community_post_reviews (
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  submitted_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_id UUID REFERENCES users ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  unpublished_at TIMESTAMPTZ,
  unpublished_by_id UUID REFERENCES users ON DELETE SET NULL,
  platform_override_at TIMESTAMPTZ,
  platform_override_by_id UUID REFERENCES users ON DELETE SET NULL,
  platform_override_action TEXT CHECK (
    platform_override_action IN ('approve', 'reject', 'unpublish', 'restore')
  ),
  platform_override_reason_code TEXT CHECK (
    platform_override_reason_code IS NULL
    OR char_length(platform_override_reason_code) BETWEEN 1 AND 100
  ),
  platform_override_private_note TEXT CHECK (
    platform_override_private_note IS NULL
    OR char_length(platform_override_private_note) <= 4000
  ),
  -- Escalation: a moderator can escalate a pending post review for senior-mod review.
  escalated_at TIMESTAMPTZ,
  escalated_by_id UUID REFERENCES users ON DELETE SET NULL,
  PRIMARY KEY (post_id),
  CHECK (NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL)),
  CHECK ((approved_at IS NULL AND rejected_at IS NULL) OR reviewed_at IS NOT NULL),
  CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  CHECK (rejection_reason IS NULL OR rejection_reason = TRIM(rejection_reason)),
  CHECK (escalated_at IS NOT NULL OR escalated_by_id IS NULL),
  CHECK (
    (platform_override_at IS NULL AND platform_override_by_id IS NULL AND platform_override_action IS NULL)
    OR
    (platform_override_at IS NOT NULL AND platform_override_by_id IS NOT NULL AND platform_override_action IS NOT NULL)
  ),
  CHECK (platform_override_at IS NOT NULL OR platform_override_reason_code IS NULL),
  CHECK (platform_override_at IS NOT NULL OR platform_override_private_note IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_community_post_reviews__platform_override_by_id
ON community_post_reviews (platform_override_by_id);

CREATE INDEX IF NOT EXISTS idx_comm_post_reviews__community ON community_post_reviews (community_id, post_id);
CREATE INDEX IF NOT EXISTS idx_comm_post_reviews__pending ON community_post_reviews (community_id) WHERE approved_at IS NULL AND rejected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_post_reviews__approved_visible
  ON community_post_reviews (community_id, approved_at DESC, post_id DESC)
  WHERE approved_at IS NOT NULL
    AND unpublished_at IS NULL
    AND rejected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_post_reviews__user_removed
  ON community_post_reviews (submitted_by_id, unpublished_at DESC, post_id DESC)
  WHERE unpublished_at IS NOT NULL;

COMMENT ON TABLE community_post_reviews IS 'Tracks the single community review state for community-scoped posts.';
COMMENT ON COLUMN community_post_reviews.community_id IS 'The community the post belongs to.';
COMMENT ON COLUMN community_post_reviews.post_id IS 'The community-scoped post under review.';
COMMENT ON COLUMN community_post_reviews.submitted_by_id IS 'User who submitted the post to the community.';
COMMENT ON COLUMN community_post_reviews.reviewed_at IS 'When a moderator reviewed the community post.';
COMMENT ON COLUMN community_post_reviews.reviewed_by_id IS 'Moderator who reviewed the community post.';
COMMENT ON COLUMN community_post_reviews.approved_at IS 'When the community post was approved. Mutually exclusive with rejected_at.';
COMMENT ON COLUMN community_post_reviews.rejected_at IS 'When the community post was rejected. Mutually exclusive with approved_at.';
COMMENT ON COLUMN community_post_reviews.rejection_reason IS 'Optional reason provided on rejection.';
COMMENT ON COLUMN community_post_reviews.unpublished_at IS 'When the post was removed from the community.';
COMMENT ON COLUMN community_post_reviews.unpublished_by_id IS 'User who removed the post from the community.';
COMMENT ON COLUMN community_post_reviews.escalated_at IS 'When a moderator escalated this pending post review for senior-mod attention. NULL means not escalated.';
COMMENT ON COLUMN community_post_reviews.escalated_by_id IS 'The moderator who escalated this pending post review.';
COMMENT ON COLUMN community_post_reviews.platform_override_at IS 'When platform moderation staff last overrode the community publication projection; while present community moderators cannot replace it.';
COMMENT ON COLUMN community_post_reviews.platform_override_by_id IS 'Platform administrator or site moderator who applied the currently controlling override.';
COMMENT ON COLUMN community_post_reviews.platform_override_action IS 'The currently controlling platform publication action.';
COMMENT ON COLUMN community_post_reviews.platform_override_reason_code IS 'Stable public-safe reason code for the controlling platform action.';
COMMENT ON COLUMN community_post_reviews.platform_override_private_note IS 'Private staff-only note for the controlling platform action.';

-- FK for posts.community_id (column defined in 0010-00-00-posts.sql without FK due to table ordering)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_posts_community_id'
      AND conrelid = 'posts'::regclass
  ) THEN
    ALTER TABLE posts ADD CONSTRAINT fk_posts_community_id FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
ALTER TABLE posts VALIDATE CONSTRAINT fk_posts_community_id;

-- RI-usable index for the community_id FK (existing composite indexes have community_id in a non-leading position)
CREATE INDEX IF NOT EXISTS idx_posts__community_id ON posts (community_id) WHERE community_id IS NOT NULL;


-- community_pinned_posts
CREATE TABLE IF NOT EXISTS community_pinned_posts (
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  order_index SMALLINT NOT NULL,
  pinned_by_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (community_id, post_id),
  CHECK (order_index >= 0 AND order_index < 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_pinned__order
  ON community_pinned_posts (community_id, order_index);

-- RI-usable indexes for the post_id/pinned_by_id FKs
CREATE INDEX IF NOT EXISTS idx_community_pinned_posts__post_id ON community_pinned_posts (post_id);
CREATE INDEX IF NOT EXISTS idx_community_pinned_posts__pinned_by_id ON community_pinned_posts (pinned_by_id);

COMMENT ON TABLE community_pinned_posts IS 'Tracks pinned posts per community with ordering. Maximum 3 pinned posts enforced by CHECK constraint.';
COMMENT ON COLUMN community_pinned_posts.community_id IS 'The community this pin belongs to.';
COMMENT ON COLUMN community_pinned_posts.post_id IS 'The pinned post.';
COMMENT ON COLUMN community_pinned_posts.order_index IS 'Display order (0-based, max 2). Lower = higher position.';
COMMENT ON COLUMN community_pinned_posts.pinned_by_id IS 'Moderator who pinned the post.';

-- ==========================================================================
-- 0210-00-00-community-agent-prompts.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE community_prompt_on_flag_action AS ENUM ('none', 'unpublish');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS community_agent_prompts (
  -- extension table: id IS an agent_prompts.id; timestamps come from agent_prompts
  id UUID NOT NULL PRIMARY KEY REFERENCES agent_prompts(id) ON DELETE CASCADE,

  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  slot_allocated BOOLEAN NOT NULL DEFAULT false,
  activated_at   TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,

  on_flag_action community_prompt_on_flag_action NOT NULL DEFAULT 'none',

  deleted_at    TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT chk_community_agent_prompts__lifecycle
    CHECK (NOT (activated_at IS NOT NULL AND deactivated_at IS NOT NULL))
);

-- Lookup by community for listing
CREATE INDEX IF NOT EXISTS idx_community_agent_prompts__community_id
  ON community_agent_prompts(community_id)
  WHERE deleted_at IS NULL;

-- Lookup by creator for slot counting
CREATE INDEX IF NOT EXISTS idx_community_agent_prompts__created_by_id__slot
  ON community_agent_prompts(created_by_id, slot_allocated)
  WHERE deleted_at IS NULL;

-- Active prompts for dispatcher
CREATE INDEX IF NOT EXISTS idx_community_agent_prompts__active
  ON community_agent_prompts(community_id)
  WHERE slot_allocated = true
    AND activated_at IS NOT NULL
    AND deactivated_at IS NULL
    AND deleted_at IS NULL;

-- RI-usable indexes for the community_id/created_by_id FKs (the indexes above carry predicates on other columns)
CREATE INDEX IF NOT EXISTS idx_community_agent_prompts__community_id_bare
  ON community_agent_prompts(community_id);
CREATE INDEX IF NOT EXISTS idx_community_agent_prompts__created_by_id
  ON community_agent_prompts(created_by_id);

COMMENT ON TABLE community_agent_prompts IS 'Extension table linking agent prompts to communities, with slot allocation and activation lifecycle.';
COMMENT ON COLUMN community_agent_prompts.community_id IS 'The community this agent prompt belongs to.';
COMMENT ON COLUMN community_agent_prompts.slot_allocated IS 'Whether this prompt has been allocated a slot for active use.';
COMMENT ON COLUMN community_agent_prompts.activated_at IS 'When the prompt was activated for community use. Mutually exclusive with deactivated_at.';
COMMENT ON COLUMN community_agent_prompts.deactivated_at IS 'When the prompt was deactivated. Mutually exclusive with activated_at.';
COMMENT ON COLUMN community_agent_prompts.on_flag_action IS 'Action taken when this community prompt flags content: none or unpublish.';

-- community_auto_tagger_agents
CREATE TABLE IF NOT EXISTS community_auto_tagger_agents (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  enabled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enabled_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  disabled_at TIMESTAMPTZ,
  disabled_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (community_id, agent_id),
  CHECK (disabled_at IS NULL OR disabled_at >= enabled_at)
);

CREATE OR REPLACE TRIGGER trigger_community_auto_tagger_agents_updated_at
  BEFORE UPDATE ON community_auto_tagger_agents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_community_auto_tagger_agents__enabled
  ON community_auto_tagger_agents(community_id)
  WHERE disabled_at IS NULL;

-- RI-usable index for the agent_id FK
CREATE INDEX IF NOT EXISTS idx_community_auto_tagger_agents__agent_id
  ON community_auto_tagger_agents(agent_id);

COMMENT ON TABLE community_auto_tagger_agents IS 'Per-community enablement for global seeded AI label/tagging agents.';
COMMENT ON COLUMN community_auto_tagger_agents.community_id IS 'Community whose posts may run this global agent.';
COMMENT ON COLUMN community_auto_tagger_agents.agent_id IS 'Global agents row enabled for the community.';
COMMENT ON COLUMN community_auto_tagger_agents.enabled_at IS 'When this global agent was enabled for the community.';
COMMENT ON COLUMN community_auto_tagger_agents.enabled_by_id IS 'User who enabled this global agent for the community. NULL when the first recorded action was disabling the agent.';
COMMENT ON COLUMN community_auto_tagger_agents.disabled_at IS 'When this global agent was disabled for the community. NULL means enabled.';
COMMENT ON COLUMN community_auto_tagger_agents.disabled_by_id IS 'User who disabled this global agent for the community.';
COMMENT ON COLUMN community_auto_tagger_agents.updated_at IS 'Last modification timestamp, maintained by trigger.';

-- ==========================================================================
-- 0340-00-00-community-list-type.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_communities__list_type
  ON communities (list_type) WHERE list_type IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN communities.list_type IS 'Determines how subscribers interact with this community''s curated list. follow = users can virtually follow all list items; mute = users can virtually mute all list items.';

-- FK for conversations.community_id (column defined in 0110-00-00 without FK due to table ordering)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conversations_community_id'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT fk_conversations_community_id FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE conversations VALIDATE CONSTRAINT fk_conversations_community_id;


-- community_saved_replies
CREATE TABLE IF NOT EXISTS community_saved_replies (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  CONSTRAINT chk_community_saved_replies__body CHECK (char_length(body) BETWEEN 1 AND 5000),
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_community_saved_replies_updated_at
  BEFORE UPDATE ON community_saved_replies FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_saved_replies__community_order
ON community_saved_replies (community_id, order_index)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_community_saved_replies__community_id
ON community_saved_replies (community_id, id DESC)
WHERE deleted_at IS NULL;

-- RI-usable index for the community_id FK (the indexes above carry a predicate, so they aren't RI-usable)
CREATE INDEX IF NOT EXISTS idx_community_saved_replies__community_id_bare
ON community_saved_replies (community_id);

COMMENT ON TABLE community_saved_replies IS 'Pre-written reply templates that moderators can insert when responding to modmail threads.';
COMMENT ON COLUMN community_saved_replies.community_id IS 'The community this saved reply belongs to.';
COMMENT ON COLUMN community_saved_replies.title IS 'Short label for the saved reply, shown in the selection UI.';
COMMENT ON COLUMN community_saved_replies.body IS 'Full reply text, up to 5000 characters.';
COMMENT ON COLUMN community_saved_replies.order_index IS 'Display order of this reply within the community list.';
COMMENT ON COLUMN community_saved_replies.created_by_id IS 'The moderator who created this saved reply.';
COMMENT ON COLUMN community_saved_replies.deleted_at IS 'When set, this saved reply has been soft-deleted.';
COMMENT ON COLUMN community_saved_replies.deleted_by_id IS 'The moderator who deleted this saved reply.';


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'curated_aside_items'::regclass
      AND conname = 'fk_curated_aside_items__topic_id'
  ) THEN
    ALTER TABLE curated_aside_items
      ADD CONSTRAINT fk_curated_aside_items__topic_id
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'curated_aside_items'::regclass
      AND conname = 'fk_curated_aside_items__rss_feed_id'
  ) THEN
    ALTER TABLE curated_aside_items
      ADD CONSTRAINT fk_curated_aside_items__rss_feed_id
      FOREIGN KEY (rss_feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'curated_aside_items'::regclass
      AND conname = 'fk_curated_aside_items__community_id'
  ) THEN
    ALTER TABLE curated_aside_items
      ADD CONSTRAINT fk_curated_aside_items__community_id
      FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

ALTER TABLE curated_aside_items
  VALIDATE CONSTRAINT fk_curated_aside_items__topic_id;
ALTER TABLE curated_aside_items
  VALIDATE CONSTRAINT fk_curated_aside_items__rss_feed_id;
ALTER TABLE curated_aside_items
  VALIDATE CONSTRAINT fk_curated_aside_items__community_id;

CREATE INDEX IF NOT EXISTS idx_communities__created_via_oauth_client_id
  ON communities (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_applications__created_via_oauth_client_id
  ON community_applications (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;
