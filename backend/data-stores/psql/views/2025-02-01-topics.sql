-- Only enough information to include in nested JSONs
CREATE OR REPLACE VIEW view_embedded_topics AS
  SELECT
    'topic' AS __entity_type,
    topics.id,
    topics.name,
    topics.slug,
    topics.markdown,
    topics.topic_type,
    topics.noindex,
    topics.allow_reviews,
    topics.created_at,
    topics.hostname_id,
    topics.homepage_url_id,
    topics.logo_image_id,
    topics.hero_image_id,
    (
      SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
      FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
      WHERE surface.surface_kind = 'topic-logo-image' AND surface.topic_id = topics.id AND placement.retired_at IS NULL
        AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
      ORDER BY placement.id DESC LIMIT 1
    ) AS logo_image_placement,
    (
      SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
      FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
      WHERE surface.surface_kind = 'topic-hero-image' AND surface.topic_id = topics.id AND placement.retired_at IS NULL
        AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
      ORDER BY placement.id DESC LIMIT 1
    ) AS hero_image_placement,
    topics.rewards_program_id,
    topics.referral_program_id,
    (
      SELECT t2.slug
      FROM topics t2
      WHERE t2.id = topics.referral_program_id
        AND t2.deleted_at IS NULL
        AND t2.merged_into_topic_id IS NULL
      LIMIT 1
    ) AS referral_program_slug,
    topics.lingua_rs_detected_language
  FROM topics
  WHERE topics.deleted_at IS NULL
    AND topics.merged_into_topic_id IS NULL
;

CREATE OR REPLACE VIEW view_topics AS
  SELECT
    'topic' AS __entity_type,
    topics.id,
    topics.name,
    topics.slug,
    topics.markdown,
    topics.topic_type,
    topics.noindex,
    topics.allow_reviews,
    topics.created_at,
    topics.hostname_id,
    topics.homepage_url_id,
    topics.logo_image_id,
    topics.hero_image_id,
    (
      SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
      FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
      WHERE surface.surface_kind = 'topic-logo-image' AND surface.topic_id = topics.id AND placement.retired_at IS NULL
        AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
      ORDER BY placement.id DESC LIMIT 1
    ) AS logo_image_placement,
    (
      SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id)
      FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
      WHERE surface.surface_kind = 'topic-hero-image' AND surface.topic_id = topics.id AND placement.retired_at IS NULL
        AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id)
      ORDER BY placement.id DESC LIMIT 1
    ) AS hero_image_placement,
    topics.rewards_program_id,
    topics.referral_program_id,
    topics.aliases,
    CASE
      WHEN view_url_hostnames.id IS NULL THEN NULL
      ELSE json_build_object(
        '__entity_type', view_url_hostnames.__entity_type,
        'id', view_url_hostnames.id,
        'hostname', view_url_hostnames.hostname,
        'topic_id', view_url_hostnames.topic_id
      )
    END AS hostname,
    (SELECT ROW_TO_JSON(eu.*) FROM view_embedded_users eu WHERE eu.id = topics.created_by_id) AS created_by,
    (SELECT ROW_TO_JSON(eu.*) FROM view_embedded_users eu WHERE eu.id = topics.updated_by_id) AS updated_by,
    topics.lingua_rs_detected_language
  FROM topics
  LEFT JOIN view_url_hostnames
    ON view_url_hostnames.id = topics.hostname_id
  WHERE topics.deleted_at IS NULL
    AND topics.merged_into_topic_id IS NULL
;
