CREATE OR REPLACE VIEW view_posts AS
  SELECT
    'post' AS __entity_type,
    posts.id,
    posts.post_type,
    posts.title,
    posts.markdown,
    posts.ai_summary_markdown,
    posts.root_id,
    posts.parent_id,
    posts.broadcast,
    posts.privacy,
    posts.is_anonymous,
    posts.created_at,
    posts.updated_at,
    (SELECT ROW_TO_JSON(eu.*) FROM view_embedded_users eu WHERE eu.id = posts.created_by_id) AS created_by,
    (SELECT ROW_TO_JSON(eu.*) FROM view_embedded_users eu WHERE eu.id = posts.updated_by_id) AS updated_by,
    (
      SELECT slug
      FROM post_slugs
      WHERE post_id = posts.id
      ORDER BY post_slugs.created_at DESC
      LIMIT 1
    ) AS slug,

    CASE WHEN posts.post_type = 'review' THEN COALESCE((
      SELECT JSON_AGG(
        jsonb_build_object(
          'topic_id', prtr.topic_id,
          'rating', prtr.rating,
          'order_index', prtr.order_index,
          'updated_at', prtr.updated_at,
          'topic', TO_JSONB(review_topics.*),
          'category_slug', cat.slug
        )
        ORDER BY prtr.order_index
      )
      FROM post_review_topic_ratings prtr
      JOIN view_embedded_topics review_topics ON prtr.topic_id = review_topics.id
      LEFT JOIN LATERAL (
        SELECT t_cat.slug
        FROM "relation__topic__category__topic" rel_cat
        JOIN topics t_cat ON t_cat.id = rel_cat.object_id AND t_cat.deleted_at IS NULL
        WHERE rel_cat.subject_id = prtr.topic_id
          AND rel_cat.deleted_at IS NULL
          AND rel_cat.votes_score_net > 0
        ORDER BY rel_cat.votes_score_sort DESC,
                 rel_cat.created_at DESC,
                 rel_cat.object_id
        LIMIT 1
      ) cat ON true
      WHERE prtr.post_id = posts.id
    ), '[]'::json) ELSE NULL END AS review_topic_ratings,

    COALESCE((
      SELECT JSON_AGG(
        TO_JSONB(topics.*)
        ORDER BY top5.votes_score_net DESC
      )
      FROM (
        SELECT rel.object_id, rel.votes_score_net
        FROM relation__post__category__topic rel
        WHERE rel.subject_id = posts.id
          AND rel.deleted_at IS NULL
          AND rel.votes_score_net > 0
        ORDER BY rel.votes_score_net DESC
        LIMIT 5
      ) top5
      JOIN view_embedded_topics topics ON topics.id = top5.object_id
    ), '[]'::json) AS post_related_topics,

    -- Authorship projection (the author's literal token), not a membership read: no equivalent
    -- exists on relation__post__category__topic_alias, so this is correctly source-only.
    -- Do not use this projection for membership filtering; test membership against the relation.
    COALESCE((
      SELECT JSON_AGG(
        jsonb_build_object(
          'id', alias.id,
          'key', alias.alias,
          'display_token', source.authored_token,
          'topic_id', alias.topic_id
        )
        ORDER BY alias.alias
      )
      FROM (
        SELECT DISTINCT ON (topic_alias_id) topic_alias_id, authored_token
        FROM post_topic_alias_sources
        WHERE post_id = posts.id
        ORDER BY topic_alias_id,
          CASE source WHEN 'title' THEN 0 WHEN 'markdown' THEN 1 ELSE 2 END
      ) source
      JOIN topic_aliases alias ON alias.id = source.topic_alias_id
    ), '[]'::json) AS post_hashtags,

    COALESCE((
      SELECT JSON_AGG(category ORDER BY category_type, category_label)
      FROM (
        SELECT
          jsonb_build_object(
            'type', 'topic',
            'topic_id', topic.id,
            'topic_name', topic.name
          ) AS category,
          'topic' AS category_type,
          topic.name AS category_label
        FROM post_explicit_topic_categories explicit
        JOIN view_embedded_topics topic ON topic.id = explicit.topic_id
        WHERE explicit.post_id = posts.id

        UNION ALL

        -- Authorship projection (the author's literal token), not a membership read: no equivalent
        -- exists on relation__post__category__topic_alias, so this is correctly source-only.
        SELECT
          jsonb_build_object(
            'type', 'hashtag',
            'hashtag', source.authored_token
          ) AS category,
          'hashtag' AS category_type,
          source.authored_token AS category_label
        FROM post_topic_alias_sources source
        WHERE source.post_id = posts.id
          AND source.source = 'explicit'
      ) explicit_categories
    ), '[]'::json) AS post_explicit_categories,

    COALESCE((
      SELECT JSON_AGG(
        json_build_object(
          'image_id', post_images.image_id,
          'order_index', post_images.order_index,
          'caption', post_images.caption
        )
        ORDER BY post_images.order_index
      )
      FROM post_images
      JOIN images ON images.id = post_images.image_id
        AND images.deleted_at IS NULL
        AND images.upload_completed_at IS NOT NULL
        AND images.quarantine_pending_at IS NULL
      WHERE post_images.post_id = posts.id
    ), '[]'::json) AS images,

    posts.community_id,
    posts.data_point_vertical,
    posts.structured_data,
    posts.created_by_id,
    posts.updated_by_id,
    posts.deleted_at,
    posts.deleted_by_id,
    CASE
      WHEN openai_moderation.disposition IS NULL THEN NULL
      ELSE openai_moderation.disposition <> 'pass'
    END AS openai_omni_moderation_flagged,
    clearance.clearance_status,
    clearance.clearance_updated_at,

    CASE WHEN posts.post_type = 'topic_recommendation' THEN (
      SELECT jsonb_build_object(
        'post_id', ptr.post_id,
        'topic_title', ptr.topic_title,
        'topic_slug', ptr.topic_slug,
        'topic_markdown', ptr.topic_markdown,
        'aliases', ptr.aliases,
        'hostname_id', ptr.hostname_id,
        'hostname', (
          SELECT TO_JSONB(vuh.*)
          FROM view_url_hostnames vuh
          WHERE vuh.id = ptr.hostname_id
          LIMIT 1
        ),
        'hostnames', COALESCE((
          SELECT JSON_AGG(TO_JSONB(vuh.*) ORDER BY vuh.hostname)
          FROM post_topic_recommendations_hostnames ptrh
          JOIN view_url_hostnames vuh ON vuh.id = ptrh.hostname_id
          WHERE ptrh.post_id = ptr.post_id
        ), '[]'::json),
        'topic_type', ptr.topic_type,
        'example_referral_link', ptr.example_referral_link,
        'landing_page_urls', ptr.landing_page_urls,
        'approval_error_message', ptr.approval_error_message,
        'status', CASE
          WHEN ptr.reviewed_at IS NULL THEN 'pending'
          WHEN ptr.created_topic_id IS NOT NULL THEN 'approved'
          ELSE 'rejected'
        END,
        'reviewed_at', ptr.reviewed_at,
        'reviewed_by_id', ptr.reviewed_by_id,
        'rejection_reason', ptr.rejection_reason,
        'created_topic_id', ptr.created_topic_id,
        'created_topic_slug', (
          SELECT t.slug
          FROM topics t
          WHERE t.id = ptr.created_topic_id
            AND t.deleted_at IS NULL
            AND t.merged_into_topic_id IS NULL
          LIMIT 1
        )
      )
      FROM post_topic_recommendations ptr
      WHERE ptr.post_id = posts.id
      ORDER BY ptr.created_at DESC
      LIMIT 1
    ) ELSE NULL END AS topic_recommendation,
    posts.archived_at,
    posts.archived_by_id,
    posts.approved_at,
    posts.rejected_at,
    posts.in_review_at,
    posts.declared_language,
    posts.lingua_rs_detected_language,
    posts.url_id,
    pl.locked_at,
    pl.locked_by_id,
    clearance.clearance_reason
  FROM posts
  JOIN view_post_clearance_status clearance ON clearance.post_id = posts.id
  LEFT JOIN LATERAL (
    SELECT disposition.disposition
    FROM post_moderation_versions version
    JOIN post_moderation_dispositions disposition ON disposition.version_id = version.id
    WHERE version.post_id = posts.id
      AND version.content_sha256 = posts.llm_moderation_content_sha256
      AND version.policy_revision = '2026-09-09.1'
      AND disposition.source = 'openai_omni'
    ORDER BY disposition.id DESC
    LIMIT 1
  ) openai_moderation ON true
  LEFT JOIN LATERAL (
    SELECT
      created_at AS locked_at,
      locked_by_id
    FROM post_locks
    WHERE post_id = posts.id
      AND lifted_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  ) pl ON true
  WHERE posts.deleted_at IS NULL
;
