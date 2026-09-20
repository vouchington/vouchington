-- Lightweight embedded view for nesting in posts/topics JSON.
-- Uses CASE + scalar subqueries for display_account instead of 7 LEFT JOINs,
-- so the planner only evaluates one subquery per row (matching provider).
CREATE OR REPLACE VIEW view_embedded_users AS
  SELECT
    'user' AS __entity_type,
    users.id,
    users.username,
    users.use_display_name_from,

    CASE
      WHEN users.use_display_name_from = 'facebook' THEN (
        SELECT jsonb_build_object('id', '', 'name', fa.facebook_user_data->>'name')
        FROM facebook_accounts fa WHERE fa.user_id = users.id
      )
      WHEN users.use_display_name_from = 'apple' THEN (
        SELECT jsonb_build_object('id', '', 'name', aa.apple_user_data->>'name')
        FROM apple_accounts aa WHERE aa.user_id = users.id
      )
      WHEN users.use_display_name_from = 'google' THEN (
        SELECT jsonb_build_object('id', '', 'name', ga.google_user_data->>'name')
        FROM google_accounts ga WHERE ga.user_id = users.id
      )
      WHEN users.use_display_name_from = 'x' THEN (
        SELECT jsonb_build_object('id', '', 'name', xa.x_user_data->>'name')
        FROM x_accounts xa WHERE xa.user_id = users.id
      )
      WHEN users.use_display_name_from = 'linkedin' THEN (
        SELECT jsonb_build_object('id', '', 'name', la.linkedin_user_data->>'name')
        FROM linkedin_accounts la WHERE la.user_id = users.id
      )
      WHEN users.use_display_name_from = 'microsoft' THEN (
        SELECT jsonb_build_object('id', '', 'name', ma.microsoft_user_data->>'name')
        FROM microsoft_accounts ma WHERE ma.user_id = users.id
      )
      WHEN users.use_display_name_from = 'github' THEN (
        SELECT jsonb_build_object('id', '', 'name', gha.github_user_data->>'name')
        FROM github_accounts gha WHERE gha.user_id = users.id
      )
      ELSE NULL
    END AS display_account,

    users.profile_image_id,
    (
      SELECT jsonb_build_object(
        'placement_id', placement.id,
        'placement_revision', placement.revision,
        'image_id', surface.image_id
      )
      FROM image_surface_placements surface
      JOIN media_placements placement ON placement.id = surface.placement_id
      WHERE surface.surface_kind = 'user-profile-image'
        AND surface.user_id = users.id
        AND placement.retired_at IS NULL
        AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
      ORDER BY placement.id DESC
      LIMIT 1
    ) AS profile_image_placement,
    ARRAY[]::text[] AS roles,

    COALESCE(
      (
      users.username IN (
        'system',
        'autotagger',
        'customer-support',
        'rss-feed-auto-updater',
        'story-teller',
        'voucha'
      )
      OR EXISTS (
        SELECT 1
        FROM user_roles
        LEFT JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
        WHERE user_roles.user_id = users.id
          AND user_roles_types.slug IN ('administrator', 'investor', 'customer_support')
      )
      OR EXISTS (
        SELECT 1
        FROM agents
        WHERE agents.system_user_id = users.id
          AND agents.deleted_at IS NULL
      )
      ),
      FALSE
    ) AS is_official_account
  FROM users
  WHERE users.deleted_at IS NULL
;

-- Full public user view for direct user queries (e.g. getPublicUserByAny).
-- Adds markdown which is intentionally excluded from view_embedded_users to keep nested payloads lean.
-- Use view_embedded_users via scalar subquery when nesting inside other views.
CREATE OR REPLACE VIEW view_users_public AS
  SELECT
    e.*,
    u.markdown,
    CASE WHEN u.verification_status = 'verified' AND u.verified_badge_visible = TRUE THEN u.verification_status ELSE NULL END AS verification_status,
    CASE WHEN u.verification_status = 'verified' AND u.verified_badge_visible = TRUE THEN u.verified_badge_visible ELSE NULL END AS verified_badge_visible,
    CASE WHEN u.verification_status = 'verified' AND u.verified_badge_visible = TRUE THEN u.public_verified_name_display ELSE NULL END AS public_verified_name_display,
    CASE
      WHEN u.verification_status = 'verified' AND u.verified_badge_visible = TRUE THEN
        CASE u.public_verified_name_display
          WHEN 'first_name' THEN u.verified_first_name
          WHEN 'first_name_last_initial' THEN
            CASE
              WHEN u.verified_first_name IS NOT NULL AND u.verified_last_name_initial IS NOT NULL
                THEN u.verified_first_name || ' ' || u.verified_last_name_initial || '.'
              ELSE u.verified_first_name
            END
          WHEN 'full_name' THEN u.verified_full_name
          ELSE NULL
        END
      ELSE NULL
    END AS verified_display_name,
    u.lingua_rs_detected_language
  FROM view_embedded_users e
  JOIN users u ON u.id = e.id
;

CREATE OR REPLACE VIEW view_users_private AS
  SELECT
    'user' AS __entity_type,
    users.id,
    users.username,
    users.use_display_name_from,

    (
      SELECT jsonb_build_object(
        'id', fa.facebook_user_id,
        'name', fa.facebook_user_data->>'name',
        'email_address', fa.facebook_user_email_address
      )
      FROM facebook_accounts fa WHERE fa.user_id = users.id
    ) AS facebook_account,

    user_email_addresses.email_address,
    user_phone_numbers.phone_number,

    (
      SELECT COALESCE(ARRAY_AGG(user_roles_types.slug), ARRAY[]::TEXT[])
      FROM user_roles
      LEFT JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
      WHERE user_roles.user_id = users.id
    ) AS roles,

    users.individual_id,
    users.profile_image_id,
    (
      SELECT jsonb_build_object(
        'placement_id', placement.id,
        'placement_revision', placement.revision,
        'image_id', surface.image_id
      )
      FROM image_surface_placements surface
      JOIN media_placements placement ON placement.id = surface.placement_id
      WHERE surface.surface_kind = 'user-profile-image'
        AND surface.user_id = users.id
        AND placement.retired_at IS NULL
        AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
      ORDER BY placement.id DESC
      LIMIT 1
    ) AS profile_image_placement,
    users.markdown,
    users.cards_visibility,
    users.rewards_program_statuses_visibility,
    users.spending_categories_visibility,
    users.follows_visibility,
    users.topic_follows_visibility,
    users.rss_feed_follows_visibility,
    users.community_memberships_visibility,
    users.followers_visibility,
    users.likes_visibility,
    users.default_post_broadcast,
    users.default_post_privacy,
    users.processing_restricted_at,
    users.third_party_marketing,
    users.hn_discussions,
    susp.suspended_at,
    susp.suspended_reason,
    susp.suspended_by_id,

    (
      SELECT jsonb_build_object(
        'id', aa.apple_user_id,
        'name', aa.apple_user_data->>'name',
        'email_address', aa.apple_user_email_address
      )
      FROM apple_accounts aa WHERE aa.user_id = users.id
    ) AS apple_account,

    (
      SELECT jsonb_build_object(
        'id', ga.google_user_id,
        'name', ga.google_user_data->>'name',
        'email_address', ga.google_user_email_address
      )
      FROM google_accounts ga WHERE ga.user_id = users.id
    ) AS google_account,

    (
      SELECT jsonb_build_object(
        'id', xa.x_user_id,
        'name', xa.x_user_data->>'name',
        'email_address', xa.x_user_email_address
      )
      FROM x_accounts xa WHERE xa.user_id = users.id
    ) AS x_account,

    (
      SELECT jsonb_build_object(
        'id', la.linkedin_user_id,
        'name', la.linkedin_user_data->>'name',
        'email_address', la.linkedin_user_email_address
      )
      FROM linkedin_accounts la WHERE la.user_id = users.id
    ) AS linkedin_account,

    (
      SELECT jsonb_build_object(
        'id', ma.microsoft_user_id,
        'name', ma.microsoft_user_data->>'name',
        'email_address', ma.microsoft_user_email_address
      )
      FROM microsoft_accounts ma WHERE ma.user_id = users.id
    ) AS microsoft_account,

    (
      SELECT jsonb_build_object(
        'id', gha.github_user_id,
        'name', gha.github_user_data->>'name',
        'email_address', gha.github_user_email_address
      )
      FROM github_accounts gha WHERE gha.user_id = users.id
    ) AS github_account,

    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.system_user_id = users.id
        AND agents.deleted_at IS NULL
    ) AS is_agent,

    paid_membership.plan AS membership_plan,

    users.verification_status,
    users.verification_provider,
    users.verification_completed_at,
    users.verified_badge_visible,
    users.public_verified_name_display,
    users.verified_first_name,
    users.verified_last_name_initial,
    users.verified_full_name,
    users.pending_verification_session_id,

    CASE
      WHEN users.verification_status = 'verified' AND users.verified_badge_visible = TRUE THEN
        CASE users.public_verified_name_display
          WHEN 'first_name' THEN users.verified_first_name
          WHEN 'first_name_last_initial' THEN
            CASE
              WHEN users.verified_first_name IS NOT NULL AND users.verified_last_name_initial IS NOT NULL
                THEN users.verified_first_name || ' ' || users.verified_last_name_initial || '.'
              ELSE users.verified_first_name
            END
          WHEN 'full_name' THEN users.verified_full_name
          ELSE NULL
        END
      ELSE NULL
    END AS verified_display_name,
    users.country,
    users.ui_locale,
    users.lingua_rs_detected_language,
    users.direct_messages_audience,
    users.bad_faith_reporter_at,
    users.engagement_emails_enabled,
    users.news_digest_frequency,
    users.moderation_emails_enabled,
    users.community_digest_frequency,
    users.moderation_email_cadence,
    users.moderation_email_days_of_week,
    users.moderation_email_time_of_day,
    users.moderation_email_timezone,
    users.fediverse_federation_enabled,

    (
      SELECT jsonb_build_object(
        'did', bla.bluesky_did,
        'handle', bla.handle
      )
      FROM bluesky_linked_accounts bla
      WHERE bla.user_id = users.id AND bla.disconnect_requested_at IS NULL
    ) AS bluesky_account
  FROM users
  LEFT JOIN user_email_addresses
    ON user_email_addresses.user_id = users.id
    AND user_email_addresses.is_primary = TRUE
  LEFT JOIN user_phone_numbers
    ON user_phone_numbers.user_id = users.id
    AND user_phone_numbers.is_primary = TRUE
  LEFT JOIN view_current_paid_memberships paid_membership
    ON paid_membership.user_id = users.id
  LEFT JOIN LATERAL (
    SELECT
      created_at AS suspended_at,
      reason AS suspended_reason,
      suspended_by_id
    FROM user_suspensions
    WHERE user_id = users.id
      AND lifted_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  ) susp ON true
  WHERE users.deleted_at IS NULL
;
