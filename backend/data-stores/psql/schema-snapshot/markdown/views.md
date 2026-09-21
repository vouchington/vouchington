# Views

[Schema index](README.md).

## `mv_rss_feed_crawl_tiers` (materialized)

Precomputed crawl_score and crawl_tier per enabled RSS feed. Refreshed nightly by the psql refreshMaterializedView job (refresh-rss-feed-crawl-tiers). Tier percentile thresholds (0.1%/1%/5%/20%) and score formula (log1p(weighted followers) + votes_score_net) are baked into this SQL. Unique follower demand weights are free=1, Plus=2, Pro=3, based on current active or past-due memberships with expires_at null or future. Unique index enables CONCURRENTLY refresh.

```sql
 WITH canonical_follows AS (
         SELECT COALESCE(rf.canonical_rss_feed_id, rf.id) AS rss_feed_id,
            f.subject_id AS user_id
           FROM (relation__user__follow__rss_feed f
             JOIN rss_feeds rf ON ((rf.id = f.object_id)))
          WHERE (f.deleted_at IS NULL)
          GROUP BY COALESCE(rf.canonical_rss_feed_id, rf.id), f.subject_id
        ), active_paid_memberships AS (
         SELECT view_current_paid_memberships.user_id,
            view_current_paid_memberships.plan
           FROM view_current_paid_memberships
        ), follow_counts AS (
         SELECT cf.rss_feed_id,
            (sum(
                CASE apm.plan
                    WHEN 'plus'::membership_plan_slugs THEN 2
                    WHEN 'pro'::membership_plan_slugs THEN 3
                    ELSE 1
                END))::integer AS weighted_follower_count
           FROM (canonical_follows cf
             LEFT JOIN active_paid_memberships apm ON ((apm.user_id = cf.user_id)))
          GROUP BY cf.rss_feed_id
        ), scored AS (
         SELECT rf.id AS rss_feed_id,
            (ln(((1)::double precision + (COALESCE(fc.weighted_follower_count, 0))::double precision)) + COALESCE(t.votes_score_net, (0)::double precision)) AS crawl_score
           FROM ((rss_feeds rf
             JOIN topics t ON ((t.id = rf.topic_id)))
             LEFT JOIN follow_counts fc ON ((fc.rss_feed_id = rf.id)))
          WHERE ((rf.deleted_at IS NULL) AND (rf.is_enabled = true))
        ), ranked AS (
         SELECT scored.rss_feed_id,
            scored.crawl_score,
            cume_dist() OVER (ORDER BY scored.crawl_score DESC) AS pct_rank
           FROM scored
        )
 SELECT rss_feed_id,
    crawl_score,
    (
        CASE
            WHEN (pct_rank <= (0.001)::double precision) THEN 1
            WHEN (pct_rank <= (0.01)::double precision) THEN 2
            WHEN (pct_rank <= (0.05)::double precision) THEN 3
            WHEN (pct_rank <= (0.20)::double precision) THEN 4
            ELSE 5
        END)::smallint AS crawl_tier
   FROM ranked;
```

## `mv_top_hashtags` (materialized)

Rolling 30-day top-hashtag recommendations from public posts and discoverable RSS items. Refreshes are debounce-enqueued from content, moderation, and topic lifecycle events and hourly as a safety net.

```sql
 WITH eligible_post_hashtags AS (
         SELECT source.topic_alias_id,
            source.authored_token,
            source.post_id AS content_id,
            'post'::text AS content_kind,
            p.created_at AS content_published_at,
            ('user:'::text || (source.contributor_id)::text) AS contributor_id
           FROM (((post_topic_alias_sources source
             JOIN posts p ON ((p.id = source.post_id)))
             JOIN view_public_post_eligibility eligibility ON ((eligibility.post_id = p.id)))
             JOIN relation__post__category__topic_alias relation ON (((relation.subject_id = source.post_id) AND (relation.object_id = source.topic_alias_id) AND (relation.deleted_at IS NULL) AND (relation.votes_score_net > (0)::double precision))))
          WHERE ((p.post_type <> 'topic_recommendation'::post_types) AND (EXISTS ( SELECT 1
                   FROM users contributor
                  WHERE ((contributor.id = source.contributor_id) AND (contributor.is_system = false) AND (contributor.deleted_at IS NULL)))) AND (EXISTS ( SELECT 1
                   FROM users post_creator
                  WHERE ((post_creator.id = p.created_by_id) AND (post_creator.is_system = false)))) AND (NOT (EXISTS ( SELECT 1
                   FROM user_suspensions suspension
                  WHERE ((suspension.user_id = source.contributor_id) AND (suspension.lifted_at IS NULL))))) AND (p.id >= uuidv7('-30 days'::interval)))
        ), eligible_rss_hashtags AS (
         SELECT category.topic_alias_id,
            category.category_text AS authored_token,
            category.rss_feed_item_id AS content_id,
            'rss_feed_item'::text AS content_kind,
            item.published_at AS content_published_at,
            ('rss:'::text || (identity.url_hostname_id)::text) AS contributor_id
           FROM ((rss_feed_item_categories category
             JOIN rss_feed_items item ON ((item.id = category.rss_feed_item_id)))
             JOIN rss_feed_item_ids identity ON ((identity.id = item.id)))
          WHERE ((category.topic_alias_id IS NOT NULL) AND (item.deleted_at IS NULL) AND (item.published_at >= (CURRENT_TIMESTAMP - '30 days'::interval)) AND (EXISTS ( SELECT 1
                   FROM ((rss_feed_item_sources source
                     JOIN rss_feeds feed ON ((feed.id = source.rss_feed_id)))
                     JOIN topics feed_topic ON ((feed_topic.id = feed.topic_id)))
                  WHERE ((source.rss_feed_item_id = item.id) AND (feed.deleted_at IS NULL) AND (feed.is_enabled = true) AND (feed.is_discoverable = true) AND (feed_topic.deleted_at IS NULL) AND (feed_topic.merged_into_topic_id IS NULL)))) AND (EXISTS ( SELECT 1
                   FROM relation__rss_feed_item__category__topic_alias relation
                  WHERE ((relation.subject_id = item.id) AND (relation.object_id = category.topic_alias_id) AND (relation.deleted_at IS NULL) AND (relation.votes_score_net > (0)::double precision)))))
        ), occurrences AS (
         SELECT eligible_post_hashtags.topic_alias_id,
            eligible_post_hashtags.authored_token,
            eligible_post_hashtags.content_id,
            eligible_post_hashtags.content_kind,
            eligible_post_hashtags.content_published_at,
            eligible_post_hashtags.contributor_id
           FROM eligible_post_hashtags
        UNION ALL
         SELECT eligible_rss_hashtags.topic_alias_id,
            eligible_rss_hashtags.authored_token,
            eligible_rss_hashtags.content_id,
            eligible_rss_hashtags.content_kind,
            eligible_rss_hashtags.content_published_at,
            eligible_rss_hashtags.contributor_id
           FROM eligible_rss_hashtags
        ), casing_frequency AS (
         SELECT occurrences.topic_alias_id,
            occurrences.authored_token,
            count(DISTINCT ((occurrences.content_kind || ':'::text) || (occurrences.content_id)::text)) AS item_count,
            max(occurrences.content_published_at) AS latest_content_at,
            (array_agg(occurrences.content_id ORDER BY occurrences.content_published_at DESC, occurrences.content_id DESC))[1] AS latest_content_id
           FROM occurrences
          GROUP BY occurrences.topic_alias_id, occurrences.authored_token
        ), casing AS (
         SELECT DISTINCT ON (casing_frequency.topic_alias_id) casing_frequency.topic_alias_id,
            casing_frequency.authored_token AS display_hashtag
           FROM casing_frequency
          ORDER BY casing_frequency.topic_alias_id, casing_frequency.item_count DESC, casing_frequency.latest_content_at DESC, casing_frequency.latest_content_id DESC, casing_frequency.authored_token
        ), aggregate AS (
         SELECT occurrences.topic_alias_id,
            count(DISTINCT ((occurrences.content_kind || ':'::text) || (occurrences.content_id)::text)) AS item_count,
            count(DISTINCT occurrences.contributor_id) AS contributor_count,
            max(occurrences.content_published_at) AS latest_content_at,
            (array_agg(occurrences.content_id ORDER BY occurrences.content_published_at DESC, occurrences.content_id DESC))[1] AS latest_content_id
           FROM occurrences
          GROUP BY occurrences.topic_alias_id
        )
 SELECT aggregate.topic_alias_id,
    casing.display_hashtag,
    aggregate.item_count,
    aggregate.contributor_count,
    aggregate.latest_content_at,
    aggregate.latest_content_id
   FROM (aggregate
     JOIN casing USING (topic_alias_id))
  WHERE (aggregate.contributor_count >= 3);
```

## `view_community_list_items`

```sql
 SELECT community_list_items__topics.id,
    community_list_items__topics.community_id,
    'topic'::community_list_item_types AS item_type,
    community_list_items__topics.topic_id AS entity_id,
    community_list_items__topics.order_index,
    community_list_items__topics.added_by_id,
    community_list_items__topics.created_at
   FROM community_list_items__topics
  WHERE (community_list_items__topics.removed_at IS NULL)
UNION ALL
 SELECT community_list_items__rss_feeds.id,
    community_list_items__rss_feeds.community_id,
    'rss_feed'::community_list_item_types AS item_type,
    community_list_items__rss_feeds.rss_feed_id AS entity_id,
    community_list_items__rss_feeds.order_index,
    community_list_items__rss_feeds.added_by_id,
    community_list_items__rss_feeds.created_at
   FROM community_list_items__rss_feeds
  WHERE (community_list_items__rss_feeds.removed_at IS NULL)
UNION ALL
 SELECT community_list_items__posts.id,
    community_list_items__posts.community_id,
    'post'::community_list_item_types AS item_type,
    community_list_items__posts.post_id AS entity_id,
    community_list_items__posts.order_index,
    community_list_items__posts.added_by_id,
    community_list_items__posts.created_at
   FROM community_list_items__posts
  WHERE (community_list_items__posts.removed_at IS NULL)
UNION ALL
 SELECT community_list_items__url_hostnames.id,
    community_list_items__url_hostnames.community_id,
    'url_hostname'::community_list_item_types AS item_type,
    community_list_items__url_hostnames.url_hostname_id AS entity_id,
    community_list_items__url_hostnames.order_index,
    community_list_items__url_hostnames.added_by_id,
    community_list_items__url_hostnames.created_at
   FROM community_list_items__url_hostnames
  WHERE (community_list_items__url_hostnames.removed_at IS NULL)
UNION ALL
 SELECT community_list_items__urls.id,
    community_list_items__urls.community_id,
    'url'::community_list_item_types AS item_type,
    community_list_items__urls.url_id AS entity_id,
    community_list_items__urls.order_index,
    community_list_items__urls.added_by_id,
    community_list_items__urls.created_at
   FROM community_list_items__urls
  WHERE (community_list_items__urls.removed_at IS NULL);
```

## `view_community_metrics`

```sql
 SELECT 'community_metrics'::text AS __entity_type,
    c.id,
    ( SELECT (count(*))::integer AS count
           FROM community_members cm
          WHERE ((cm.community_id = c.id) AND (cm.removed_at IS NULL))) AS member_count,
    ( SELECT (count(*))::integer AS count
           FROM ((posts p
             JOIN view_public_post_eligibility eligibility ON ((eligibility.post_id = p.id)))
             JOIN community_post_reviews cpr ON (((cpr.post_id = p.id) AND (cpr.community_id = c.id))))
          WHERE ((p.community_id = c.id) AND (cpr.approved_at IS NOT NULL) AND (cpr.unpublished_at IS NULL) AND (cpr.rejected_at IS NULL))) AS post_count,
    ( SELECT (count(*))::integer AS count
           FROM view_community_list_items vcli
          WHERE (vcli.community_id = c.id)) AS list_item_count,
    proxy_follow.proxy_follow_count,
    proxy_mute.proxy_mute_count,
    (proxy_follow.proxy_follow_count + proxy_mute.proxy_mute_count) AS virtual_subscription_count
   FROM ((communities c
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS proxy_follow_count
           FROM relation__user__proxy_follow__community rpf
          WHERE ((rpf.object_id = c.id) AND (rpf.deleted_at IS NULL))) proxy_follow ON (true))
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS proxy_mute_count
           FROM relation__user__proxy_mute__community rpm
          WHERE ((rpm.object_id = c.id) AND (rpm.deleted_at IS NULL))) proxy_mute ON (true))
  WHERE (c.deleted_at IS NULL);
```

## `view_current_paid_memberships`

```sql
 SELECT DISTINCT ON (m.user_id) m.user_id,
    product.plan
   FROM (((((memberships m
     JOIN membership_products product ON ((product.id = m.membership_product_id)))
     JOIN membership_sources source ON ((source.id = m.membership_source_id)))
     LEFT JOIN membership_source_states source_state ON ((source_state.membership_source_id = source.id)))
     LEFT JOIN membership_provider_observations observation ON ((observation.id = source_state.membership_provider_observation_id)))
     LEFT JOIN membership_provider_evidence_records evidence ON ((evidence.id = observation.membership_provider_evidence_id)))
  WHERE ((m.projection_ended_at IS NULL) AND (m.cancelled_at IS NULL) AND (m.expired_at IS NULL) AND (m.paused_at IS NULL) AND ((source.source_kind = 'direct'::membership_source_kinds) OR (m.expires_at IS NULL) OR (m.expires_at > CURRENT_TIMESTAMP)) AND ((source.source_kind <> 'family'::membership_source_kinds) OR ((source_state.cancelled_at IS NULL) AND (source_state.expired_at IS NULL) AND (source_state.past_due_at IS NULL) AND (source_state.paused_at IS NULL) AND (source_state.effective_at <= CURRENT_TIMESTAMP) AND ((source_state.expires_at IS NULL) OR (source_state.expires_at > CURRENT_TIMESTAMP)) AND (evidence.verified_at IS NOT NULL) AND (evidence.rejected_at IS NULL))))
  ORDER BY m.user_id,
        CASE product.plan
            WHEN 'pro'::membership_plan_slugs THEN 3
            WHEN 'plus'::membership_plan_slugs THEN 2
            ELSE NULL::integer
        END DESC, m.id DESC;
```

## `view_embedded_topics`

```sql
 SELECT 'topic'::text AS __entity_type,
    id,
    name,
    slug,
    markdown,
    topic_type,
    noindex,
    allow_reviews,
    created_at,
    hostname_id,
    homepage_url_id,
    logo_image_id,
    hero_image_id,
    ( SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id) AS jsonb_build_object
           FROM (image_surface_placements surface
             JOIN media_placements placement ON ((placement.id = surface.placement_id)))
          WHERE ((surface.surface_kind = 'topic-logo-image'::text) AND (surface.topic_id = topics.id) AND (placement.retired_at IS NULL) AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id))
          ORDER BY placement.id DESC
         LIMIT 1) AS logo_image_placement,
    ( SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id) AS jsonb_build_object
           FROM (image_surface_placements surface
             JOIN media_placements placement ON ((placement.id = surface.placement_id)))
          WHERE ((surface.surface_kind = 'topic-hero-image'::text) AND (surface.topic_id = topics.id) AND (placement.retired_at IS NULL) AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id))
          ORDER BY placement.id DESC
         LIMIT 1) AS hero_image_placement,
    rewards_program_id,
    referral_program_id,
    ( SELECT t2.slug
           FROM topics t2
          WHERE ((t2.id = topics.referral_program_id) AND (t2.deleted_at IS NULL) AND (t2.merged_into_topic_id IS NULL))
         LIMIT 1) AS referral_program_slug,
    lingua_rs_detected_language
   FROM topics
  WHERE ((deleted_at IS NULL) AND (merged_into_topic_id IS NULL));
```

## `view_embedded_users`

```sql
 SELECT 'user'::text AS __entity_type,
    id,
    username,
    use_display_name_from,
        CASE
            WHEN (use_display_name_from = 'facebook'::user_display_name_source) THEN ( SELECT jsonb_build_object('id', '', 'name', (fa.facebook_user_data ->> 'name'::text)) AS jsonb_build_object
               FROM facebook_accounts fa
              WHERE (fa.user_id = users.id))
            WHEN (use_display_name_from = 'apple'::user_display_name_source) THEN ( SELECT jsonb_build_object('id', '', 'name', (aa.apple_user_data ->> 'name'::text)) AS jsonb_build_object
               FROM apple_accounts aa
              WHERE (aa.user_id = users.id))
            WHEN (use_display_name_from = 'google'::user_display_name_source) THEN ( SELECT jsonb_build_object('id', '', 'name', (ga.google_user_data ->> 'name'::text)) AS jsonb_build_object
               FROM google_accounts ga
              WHERE (ga.user_id = users.id))
            WHEN (use_display_name_from = 'x'::user_display_name_source) THEN ( SELECT jsonb_build_object('id', '', 'name', (xa.x_user_data ->> 'name'::text)) AS jsonb_build_object
               FROM x_accounts xa
              WHERE (xa.user_id = users.id))
            WHEN (use_display_name_from = 'linkedin'::user_display_name_source) THEN ( SELECT jsonb_build_object('id', '', 'name', (la.linkedin_user_data ->> 'name'::text)) AS jsonb_build_object
               FROM linkedin_accounts la
              WHERE (la.user_id = users.id))
            WHEN (use_display_name_from = 'microsoft'::user_display_name_source) THEN ( SELECT jsonb_build_object('id', '', 'name', (ma.microsoft_user_data ->> 'name'::text)) AS jsonb_build_object
               FROM microsoft_accounts ma
              WHERE (ma.user_id = users.id))
            WHEN (use_display_name_from = 'github'::user_display_name_source) THEN ( SELECT jsonb_build_object('id', '', 'name', (gha.github_user_data ->> 'name'::text)) AS jsonb_build_object
               FROM github_accounts gha
              WHERE (gha.user_id = users.id))
            ELSE NULL::jsonb
        END AS display_account,
    profile_image_id,
    ( SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id) AS jsonb_build_object
           FROM (image_surface_placements surface
             JOIN media_placements placement ON ((placement.id = surface.placement_id)))
          WHERE ((surface.surface_kind = 'user-profile-image'::text) AND (surface.user_id = users.id) AND (placement.retired_at IS NULL) AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id))
          ORDER BY placement.id DESC
         LIMIT 1) AS profile_image_placement,
    ARRAY[]::text[] AS roles,
    COALESCE(((username = ANY (ARRAY['system'::text, 'autotagger'::text, 'customer-support'::text, 'rss-feed-auto-updater'::text, 'story-teller'::text, 'voucha'::text])) OR (EXISTS ( SELECT 1
           FROM (user_roles
             LEFT JOIN user_roles_types ON ((user_roles_types.id = user_roles.role_type_id)))
          WHERE ((user_roles.user_id = users.id) AND (user_roles_types.slug = ANY (ARRAY['administrator'::text, 'investor'::text, 'customer_support'::text]))))) OR (EXISTS ( SELECT 1
           FROM agents
          WHERE ((agents.system_user_id = users.id) AND (agents.deleted_at IS NULL))))), false) AS is_official_account
   FROM users
  WHERE (deleted_at IS NULL);
```

## `view_list_items`

```sql
 SELECT li.id,
    li.list_id,
    'rss_feed_item'::list_item_types AS item_type,
    li.rss_feed_item_id AS entity_id,
    li.order_index,
    li.created_at,
    (rfi.media_type)::text AS media_type
   FROM (list_items__rss_feed_items li
     JOIN rss_feed_items rfi ON (((rfi.id = li.rss_feed_item_id) AND (rfi.deleted_at IS NULL))))
  WHERE (li.removed_at IS NULL)
UNION ALL
 SELECT li.id,
    li.list_id,
    'post'::list_item_types AS item_type,
    li.post_id AS entity_id,
    li.order_index,
    li.created_at,
    NULL::text AS media_type
   FROM list_items__posts li
  WHERE (li.removed_at IS NULL);
```

## `view_memberships`

```sql
 SELECT 'membership'::text AS __entity_type,
    m.id,
    m.user_id,
    p.plan,
        CASE
            WHEN (m.cancelled_at IS NOT NULL) THEN 'cancelled'::text
            WHEN (m.expired_at IS NOT NULL) THEN 'expired'::text
            WHEN ((source.source_kind = 'family'::membership_source_kinds) AND ((source_state.cancelled_at IS NOT NULL) OR (source_state.expired_at IS NOT NULL) OR (source_state.past_due_at IS NOT NULL) OR (source_state.paused_at IS NOT NULL) OR (source_state.effective_at > now()) OR (source_state.expires_at <= now()) OR (evidence.verified_at IS NULL) OR (evidence.rejected_at IS NOT NULL))) THEN 'expired'::text
            WHEN ((source.source_kind = ANY (ARRAY['family'::membership_source_kinds, 'admin_grant'::membership_source_kinds])) AND (m.expires_at IS NOT NULL) AND (m.expires_at <= now())) THEN 'expired'::text
            WHEN (m.past_due_at IS NOT NULL) THEN 'past_due'::text
            WHEN (m.paused_at IS NOT NULL) THEN 'paused'::text
            ELSE 'active'::text
        END AS status,
    m.effective_at AS started_at,
    m.expires_at,
        CASE
            WHEN ((lineage.provider = 'stripe'::membership_provider_kinds) AND (source.source_kind = 'direct'::membership_source_kinds)) THEN lineage.provider_lineage_id
            ELSE NULL::text
        END AS stripe_subscription_id,
        CASE
            WHEN ((lineage.provider = 'stripe'::membership_provider_kinds) AND (source.source_kind = 'direct'::membership_source_kinds)) THEN lineage.provider_account_id
            ELSE NULL::text
        END AS stripe_customer_id,
    membership_grant.granted_by_id,
    m.cancelled_at,
    m.expired_at,
    m.past_due_at,
    m.paused_at,
    m.cancel_at_period_end,
    m.latest_change_id,
    m.created_at,
    m.updated_at,
    json_build_object('id', p.id, 'plan', p.plan, 'price',
        CASE
            WHEN (stripe_mapping.provider_product_id IS NULL) THEN NULL::json
            ELSE json_build_object('amount', stripe_mapping.price_minor_units, 'currency', stripe_mapping.currency_code)
        END, 'interval', p.billing_interval, 'stripe_price_id', stripe_mapping.provider_product_id, 'retired_at', p.retired_at) AS sku
   FROM ((((((((memberships m
     JOIN membership_products p ON ((p.id = m.membership_product_id)))
     JOIN membership_sources source ON ((source.id = m.membership_source_id)))
     LEFT JOIN membership_source_states source_state ON ((source_state.membership_source_id = source.id)))
     LEFT JOIN membership_provider_observations observation ON ((observation.id = source_state.membership_provider_observation_id)))
     LEFT JOIN membership_provider_evidence_records evidence ON ((evidence.id = observation.membership_provider_evidence_id)))
     LEFT JOIN membership_grants membership_grant ON ((membership_grant.membership_source_id = source.id)))
     LEFT JOIN membership_provider_lineages lineage ON ((lineage.id = source.membership_provider_lineage_id)))
     LEFT JOIN LATERAL ( SELECT membership_provider_products.provider_product_id,
            membership_provider_products.price_minor_units,
            membership_provider_products.currency_code
           FROM membership_provider_products
          WHERE ((membership_provider_products.membership_product_id = p.id) AND (membership_provider_products.provider = 'stripe'::membership_provider_kinds) AND (source.source_kind <> 'admin_grant'::membership_source_kinds) AND (((source.source_kind = 'direct'::membership_source_kinds) AND (lineage.provider = 'stripe'::membership_provider_kinds) AND (membership_provider_products.environment = lineage.environment)) OR (source.source_kind <> 'direct'::membership_source_kinds)) AND (membership_provider_products.application_id =
                CASE
                    WHEN ((source.source_kind = 'direct'::membership_source_kinds) AND (lineage.provider = 'stripe'::membership_provider_kinds)) THEN lineage.application_id
                    ELSE 'voucha-web'::text
                END))
          ORDER BY membership_provider_products.id DESC
         LIMIT 1) stripe_mapping ON (true))
  WHERE (m.projection_ended_at IS NULL);
```

## `view_post_clearance_status`

```sql
 SELECT posts.id AS post_id,
    posts.latest_clearance_change_id,
        CASE
            WHEN (posts.approved_at IS NOT NULL) THEN 'approved'::text
            WHEN (posts.rejected_at IS NOT NULL) THEN 'rejected'::text
            WHEN (posts.in_review_at IS NOT NULL) THEN 'in_review'::text
            ELSE 'pending'::text
        END AS clearance_status,
    COALESCE(posts.approved_at, posts.rejected_at, posts.in_review_at, post_clearance_changes.created_at) AS clearance_updated_at,
        CASE
            WHEN ((posts.rejected_at IS NOT NULL) OR (posts.in_review_at IS NOT NULL)) THEN post_clearance_changes.public_reason_code
            ELSE NULL::text
        END AS clearance_reason
   FROM (posts
     LEFT JOIN post_clearance_changes ON ((post_clearance_changes.id = posts.latest_clearance_change_id)));
```

## `view_posts`

```sql
 SELECT 'post'::text AS __entity_type,
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
    ( SELECT row_to_json(eu.*) AS row_to_json
           FROM view_embedded_users eu
          WHERE (eu.id = posts.created_by_id)) AS created_by,
    ( SELECT row_to_json(eu.*) AS row_to_json
           FROM view_embedded_users eu
          WHERE (eu.id = posts.updated_by_id)) AS updated_by,
    ( SELECT post_slugs.slug
           FROM post_slugs
          WHERE (post_slugs.post_id = posts.id)
          ORDER BY post_slugs.created_at DESC
         LIMIT 1) AS slug,
        CASE
            WHEN (posts.post_type = 'review'::post_types) THEN COALESCE(( SELECT json_agg(jsonb_build_object('topic_id', prtr.topic_id, 'rating', prtr.rating, 'order_index', prtr.order_index, 'updated_at', prtr.updated_at, 'topic', to_jsonb(review_topics.*), 'category_slug', cat.slug) ORDER BY prtr.order_index) AS json_agg
               FROM ((post_review_topic_ratings prtr
                 JOIN view_embedded_topics review_topics ON ((prtr.topic_id = review_topics.id)))
                 LEFT JOIN LATERAL ( SELECT t_cat.slug
                       FROM (relation__topic__category__topic rel_cat
                         JOIN topics t_cat ON (((t_cat.id = rel_cat.object_id) AND (t_cat.deleted_at IS NULL))))
                      WHERE ((rel_cat.subject_id = prtr.topic_id) AND (rel_cat.deleted_at IS NULL) AND (rel_cat.votes_score_net > (0)::double precision))
                      ORDER BY rel_cat.votes_score_sort DESC, rel_cat.created_at DESC, rel_cat.object_id
                     LIMIT 1) cat ON (true))
              WHERE (prtr.post_id = posts.id)), '[]'::json)
            ELSE NULL::json
        END AS review_topic_ratings,
    COALESCE(( SELECT json_agg(to_jsonb(topics.*) ORDER BY top5.votes_score_net DESC) AS json_agg
           FROM (( SELECT rel.object_id,
                    rel.votes_score_net
                   FROM relation__post__category__topic rel
                  WHERE ((rel.subject_id = posts.id) AND (rel.deleted_at IS NULL) AND (rel.votes_score_net > (0)::double precision))
                  ORDER BY rel.votes_score_net DESC
                 LIMIT 5) top5
             JOIN view_embedded_topics topics ON ((topics.id = top5.object_id)))), '[]'::json) AS post_related_topics,
    COALESCE(( SELECT json_agg(jsonb_build_object('id', alias.id, 'key', alias.alias, 'display_token', source.authored_token, 'topic_id', alias.topic_id) ORDER BY alias.alias) AS json_agg
           FROM (( SELECT DISTINCT ON (post_topic_alias_sources.topic_alias_id) post_topic_alias_sources.topic_alias_id,
                    post_topic_alias_sources.authored_token
                   FROM post_topic_alias_sources
                  WHERE (post_topic_alias_sources.post_id = posts.id)
                  ORDER BY post_topic_alias_sources.topic_alias_id,
                        CASE post_topic_alias_sources.source
                            WHEN 'title'::text THEN 0
                            WHEN 'markdown'::text THEN 1
                            ELSE 2
                        END) source
             JOIN topic_aliases alias ON ((alias.id = source.topic_alias_id)))), '[]'::json) AS post_hashtags,
    COALESCE(( SELECT json_agg(explicit_categories.category ORDER BY explicit_categories.category_type, explicit_categories.category_label) AS json_agg
           FROM ( SELECT jsonb_build_object('type', 'topic', 'topic_id', topic.id, 'topic_name', topic.name) AS category,
                    'topic'::text AS category_type,
                    topic.name AS category_label
                   FROM (post_explicit_topic_categories explicit
                     JOIN view_embedded_topics topic ON ((topic.id = explicit.topic_id)))
                  WHERE (explicit.post_id = posts.id)
                UNION ALL
                 SELECT jsonb_build_object('type', 'hashtag', 'hashtag', source.authored_token) AS category,
                    'hashtag'::text AS category_type,
                    source.authored_token AS category_label
                   FROM post_topic_alias_sources source
                  WHERE ((source.post_id = posts.id) AND (source.source = 'explicit'::text))) explicit_categories), '[]'::json) AS post_explicit_categories,
    COALESCE(( SELECT json_agg(json_build_object('image_id', post_images.image_id, 'placement_id', placement.id, 'placement_revision', placement.revision, 'order_index', post_images.order_index, 'caption', post_images.caption) ORDER BY post_images.order_index) AS json_agg
           FROM ((post_images
             JOIN image_placements image_placement ON (((image_placement.post_id = post_images.post_id) AND (image_placement.image_id = post_images.image_id))))
             JOIN media_placements placement ON (((placement.id = image_placement.placement_id) AND (placement.retired_at IS NULL) AND fn_image_placement_publicly_projected(placement.id, placement.revision, post_images.image_id))))
          WHERE (post_images.post_id = posts.id)), '[]'::json) AS images,
    posts.community_id,
    posts.data_point_vertical,
    posts.structured_data,
    posts.created_by_id,
    posts.updated_by_id,
    posts.deleted_at,
    posts.deleted_by_id,
        CASE
            WHEN (openai_moderation.disposition IS NULL) THEN NULL::boolean
            ELSE (openai_moderation.disposition <> 'pass'::post_moderation_disposition_types)
        END AS openai_omni_moderation_flagged,
    clearance.clearance_status,
    clearance.clearance_updated_at,
        CASE
            WHEN (posts.post_type = 'topic_recommendation'::post_types) THEN ( SELECT jsonb_build_object('post_id', ptr.post_id, 'topic_title', ptr.topic_title, 'topic_slug', ptr.topic_slug, 'topic_markdown', ptr.topic_markdown, 'aliases', ptr.aliases, 'hostname_id', ptr.hostname_id, 'hostname', ( SELECT to_jsonb(vuh.*) AS to_jsonb
                       FROM view_url_hostnames vuh
                      WHERE (vuh.id = ptr.hostname_id)
                     LIMIT 1), 'hostnames', COALESCE(( SELECT json_agg(to_jsonb(vuh.*) ORDER BY vuh.hostname) AS json_agg
                       FROM (post_topic_recommendations_hostnames ptrh
                         JOIN view_url_hostnames vuh ON ((vuh.id = ptrh.hostname_id)))
                      WHERE (ptrh.post_id = ptr.post_id)), '[]'::json), 'topic_type', ptr.topic_type, 'example_referral_link', ptr.example_referral_link, 'landing_page_urls', ptr.landing_page_urls, 'approval_error_message', ptr.approval_error_message, 'status',
                    CASE
                        WHEN (ptr.reviewed_at IS NULL) THEN 'pending'::text
                        WHEN (ptr.created_topic_id IS NOT NULL) THEN 'approved'::text
                        ELSE 'rejected'::text
                    END, 'reviewed_at', ptr.reviewed_at, 'reviewed_by_id', ptr.reviewed_by_id, 'rejection_reason', ptr.rejection_reason, 'created_topic_id', ptr.created_topic_id, 'created_topic_slug', ( SELECT t.slug
                       FROM topics t
                      WHERE ((t.id = ptr.created_topic_id) AND (t.deleted_at IS NULL) AND (t.merged_into_topic_id IS NULL))
                     LIMIT 1)) AS jsonb_build_object
               FROM post_topic_recommendations ptr
              WHERE (ptr.post_id = posts.id)
              ORDER BY ptr.created_at DESC
             LIMIT 1)
            ELSE NULL::jsonb
        END AS topic_recommendation,
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
   FROM (((posts
     JOIN view_post_clearance_status clearance ON ((clearance.post_id = posts.id)))
     LEFT JOIN LATERAL ( SELECT disposition.disposition
           FROM (post_moderation_versions version
             JOIN post_moderation_dispositions disposition ON ((disposition.version_id = version.id)))
          WHERE ((version.post_id = posts.id) AND (version.content_sha256 = posts.llm_moderation_content_sha256) AND (version.policy_revision = '2026-09-09.1'::text) AND (disposition.source = 'openai_omni'::post_moderation_sources))
          ORDER BY disposition.id DESC
         LIMIT 1) openai_moderation ON (true))
     LEFT JOIN LATERAL ( SELECT post_locks.created_at AS locked_at,
            post_locks.locked_by_id
           FROM post_locks
          WHERE ((post_locks.post_id = posts.id) AND (post_locks.lifted_at IS NULL))
          ORDER BY post_locks.id DESC
         LIMIT 1) pl ON (true))
  WHERE (posts.deleted_at IS NULL);
```

## `view_public_post_eligibility`

Canonical anonymous discovery eligibility for authored posts. Keep equivalent to buildPublicPostEligibilityFilter; integration tests compare both owners.

```sql
 SELECT candidate_post.id AS post_id,
    candidate_post.post_type
   FROM (((posts candidate_post
     JOIN posts root_post ON ((root_post.id = COALESCE(candidate_post.root_id, candidate_post.id))))
     LEFT JOIN user_suspensions root_suspension ON (((root_suspension.user_id = root_post.created_by_id) AND (root_suspension.lifted_at IS NULL))))
     LEFT JOIN user_suspensions candidate_suspension ON (((candidate_suspension.user_id = candidate_post.created_by_id) AND (candidate_suspension.lifted_at IS NULL))))
  WHERE ((candidate_post.deleted_at IS NULL) AND (candidate_post.approved_at IS NOT NULL) AND (candidate_post.archived_at IS NULL) AND (candidate_suspension.user_id IS NULL) AND (root_post.deleted_at IS NULL) AND (root_post.approved_at IS NOT NULL) AND (root_post.archived_at IS NULL) AND (root_post.privacy = 'public'::privacy_types) AND (root_post.broadcast = 'everyone'::broadcast_types) AND ((root_post.community_id IS NULL) OR (EXISTS ( SELECT 1
           FROM (communities publication_community
             JOIN community_post_reviews publication_review ON (((publication_review.community_id = publication_community.id) AND (publication_review.post_id = root_post.id) AND (publication_review.approved_at IS NOT NULL) AND (publication_review.rejected_at IS NULL) AND (publication_review.unpublished_at IS NULL))))
          WHERE ((publication_community.id = root_post.community_id) AND (publication_community.deleted_at IS NULL) AND (publication_community.archived_at IS NULL) AND (publication_community.visibility = 'public'::community_visibility_types))
         OFFSET 0))) AND ((root_post.post_type <> 'story'::post_types) OR (EXISTS ( SELECT 1
           FROM ((post__stories post_story
             JOIN stories publication_story ON (((publication_story.id = post_story.story_id) AND (publication_story.deleted_at IS NULL))))
             JOIN rss_feed_items story_item ON (((story_item.story_id = publication_story.id) AND (story_item.deleted_at IS NULL))))
          WHERE ((post_story.post_id = root_post.id) AND (EXISTS ( SELECT 1
                   FROM (rss_feed_item_sources story_source
                     JOIN rss_feeds story_feed ON ((story_feed.id = story_source.rss_feed_id)))
                  WHERE ((story_source.rss_feed_item_id = story_item.id) AND (story_feed.deleted_at IS NULL) AND (story_feed.is_enabled = true) AND (story_feed.is_discoverable = true))
                 OFFSET 0)))
         OFFSET 0))) AND (root_suspension.user_id IS NULL));
```

## `view_rss_feed_current_states`

```sql
 SELECT id AS rss_feed_id,
    is_enabled,
    is_discoverable
   FROM rss_feeds;
```

## `view_rss_feed_items`

```sql
 SELECT 'rss_feed_item'::text AS __entity_type,
    rss_feed_items.id,
    rss_feed_item_ids.guid,
    rss_feed_item_ids.url_hostname_id,
    rss_feed_items.published_at,
    rss_feed_items.media_type,
    rss_feed_items.enclosure_url,
    rss_feed_items.enclosure_type,
    rss_feed_items.enclosure_length,
    rss_feed_items.duration_seconds,
    rss_feed_items.thumbnail_url,
    rss_feed_items.video_id,
    rss_feed_items.video_platform,
    rss_feed_items.data,
    row_to_json(view_urls.*) AS url,
    row_to_json(primary_feed.*) AS rss_feed,
    COALESCE(all_sources.rss_feed_sources, '[]'::json) AS rss_feed_sources,
    COALESCE(( SELECT json_agg(sub.cat ORDER BY sub.cat_order, sub.cat_score DESC NULLS LAST, sub.cat_text) AS json_agg
           FROM ( SELECT jsonb_build_object('id', rel.id, 'category_text', vet.name, 'topic', to_jsonb(vet.*), 'hashtag',
                        CASE
                            WHEN (mapped_hashtag.id IS NULL) THEN NULL::jsonb
                            ELSE jsonb_build_object('id', mapped_hashtag.id, 'key', mapped_hashtag.alias, 'display_token', mapped_hashtag.category_text, 'topic_id', mapped_hashtag.topic_id)
                        END, 'votes_score_net', rel.votes_score_net) AS cat,
                    0 AS cat_order,
                    rel.votes_score_net AS cat_score,
                    COALESCE(mapped_hashtag.category_text, vet.name) AS cat_text
                   FROM ((relation__rss_feed_item__category__topic rel
                     JOIN view_embedded_topics vet ON ((vet.id = rel.object_id)))
                     LEFT JOIN LATERAL ( SELECT alias.id,
                            alias.alias,
                            alias.topic_id,
                            rfc.category_text
                           FROM ((rss_feed_item_categories rfc
                             JOIN topic_aliases alias ON ((alias.id = rfc.topic_alias_id)))
                             JOIN relation__rss_feed_item__category__topic_alias alias_relation ON (((alias_relation.subject_id = rfc.rss_feed_item_id) AND (alias_relation.object_id = rfc.topic_alias_id) AND (alias_relation.deleted_at IS NULL) AND (alias_relation.votes_score_net > (0)::double precision))))
                          WHERE ((rfc.rss_feed_item_id = rel.subject_id) AND (rfc.topic_id = rel.object_id))) mapped_hashtag ON (true))
                  WHERE ((rel.subject_id = rss_feed_items.id) AND (rel.deleted_at IS NULL) AND (rel.votes_score_net > (0)::double precision))
                UNION ALL
                 SELECT jsonb_build_object('id', NULL::unknown, 'category_text', rfc.category_text, 'topic', NULL::unknown, 'hashtag',
                        CASE
                            WHEN (alias.id IS NULL) THEN NULL::jsonb
                            ELSE jsonb_build_object('id', alias.id, 'key', alias.alias, 'display_token', rfc.category_text, 'topic_id', alias.topic_id)
                        END, 'votes_score_net', NULL::unknown) AS cat,
                    1 AS cat_order,
                    NULL::double precision AS cat_score,
                    rfc.category_text AS cat_text
                   FROM ((rss_feed_item_categories rfc
                     LEFT JOIN topic_aliases alias ON ((alias.id = rfc.topic_alias_id)))
                     LEFT JOIN relation__rss_feed_item__category__topic_alias relation ON (((relation.subject_id = rfc.rss_feed_item_id) AND (relation.object_id = rfc.topic_alias_id) AND (relation.deleted_at IS NULL) AND (relation.votes_score_net > (0)::double precision))))
                  WHERE ((rfc.rss_feed_item_id = rss_feed_items.id) AND ((rfc.topic_id IS NULL) OR (NOT (EXISTS ( SELECT 1
                           FROM relation__rss_feed_item__category__topic topic_relation
                          WHERE ((topic_relation.subject_id = rfc.rss_feed_item_id) AND (topic_relation.object_id = rfc.topic_id) AND (topic_relation.deleted_at IS NULL) AND (topic_relation.votes_score_net > (0)::double precision)))))) AND ((rfc.topic_alias_id IS NULL) OR (relation.id IS NOT NULL)))) sub), '[]'::json) AS categories,
    rss_feed_items.lingua_rs_detected_language
   FROM (((((rss_feed_items
     JOIN rss_feed_item_ids ON ((rss_feed_item_ids.id = rss_feed_items.id)))
     LEFT JOIN view_urls ON ((view_urls.id = rss_feed_items.url_id)))
     JOIN LATERAL ( SELECT rfis.rss_feed_id
           FROM (((rss_feed_item_sources rfis
             JOIN rss_feeds rf ON ((rf.id = rfis.rss_feed_id)))
             JOIN topics t ON ((t.id = rf.topic_id)))
             JOIN view_rss_feed_current_states current_state ON ((current_state.rss_feed_id = rf.id)))
          WHERE ((rfis.rss_feed_item_id = rss_feed_items.id) AND (rf.deleted_at IS NULL))
          ORDER BY current_state.is_enabled DESC, current_state.is_discoverable DESC, t.votes_score_net DESC NULLS LAST, rfis.created_at
         LIMIT 1) best_source ON (true))
     JOIN view_rss_feeds primary_feed ON ((primary_feed.id = best_source.rss_feed_id)))
     LEFT JOIN LATERAL ( SELECT json_agg(row_to_json(vrf.*) ORDER BY vrf.is_enabled DESC, vrf.is_discoverable DESC, t2.votes_score_net DESC NULLS LAST, rfis2.created_at) AS rss_feed_sources
           FROM (((rss_feed_item_sources rfis2
             JOIN rss_feeds rf2 ON ((rf2.id = rfis2.rss_feed_id)))
             JOIN view_rss_feeds vrf ON ((vrf.id = rfis2.rss_feed_id)))
             JOIN topics t2 ON ((t2.id = rf2.topic_id)))
          WHERE (rfis2.rss_feed_item_id = rss_feed_items.id)) all_sources ON (true))
  WHERE (rss_feed_items.deleted_at IS NULL);
```

## `view_rss_feeds`

```sql
 SELECT 'rss_feed'::text AS __entity_type,
    rss_feeds.id,
    rss_feeds.title,
    current_state.is_enabled,
    current_state.is_discoverable,
    rss_feeds.etag,
    rss_feeds.last_modified_at,
    rss_feeds.last_fetched_at,
    rss_feeds.feed_type,
    rss_feeds.canonical_rss_feed_id,
    json_build_object('__entity_type', 'url', 'id', feed_url.id, 'url', feed_url.url, 'pathname', feed_url.pathname, 'search_params', feed_url.search_params, 'canonical_url_id', feed_url.canonical_url_id, 'hostname', json_build_object('__entity_type', 'hostname', 'id', feed_hostname.id, 'hostname', feed_hostname.hostname, 'topic_id', feed_hostname.topic_id, 'blocked', feed_hostname.blocked, 'crawlable', feed_hostname.crawlable, 'link_rel_follow', feed_hostname.link_rel_follow)) AS rss_feed_url,
        CASE
            WHEN (topic_hostname.hostname IS NULL) THEN NULL::json
            ELSE json_build_object('url', concat('https://', topic_hostname.hostname, '/'))
        END AS home_page_url,
    row_to_json(view_embedded_topics.*) AS topic,
        CASE
            WHEN (publisher_type_topic.id IS NULL) THEN NULL::json
            ELSE json_build_object('id', publisher_type_topic.id, 'slug', publisher_type_topic.slug, 'topic_type', publisher_type_topic.topic_type, 'name', publisher_type_topic.name)
        END AS publisher_type,
        CASE
            WHEN (topic_hostname.id IS NULL) THEN NULL::json
            ELSE json_build_object('__entity_type', topic_hostname.__entity_type, 'id', topic_hostname.id, 'hostname', topic_hostname.hostname, 'topic_id', topic_hostname.topic_id)
        END AS hostname,
        CASE
            WHEN (podcast_show.rss_feed_id IS NULL) THEN NULL::json
            ELSE json_build_object('itunes_author', podcast_show.itunes_author, 'itunes_owner_name', podcast_show.itunes_owner_name, 'cover_art_url', podcast_show.cover_art_url, 'is_explicit', podcast_show.is_explicit, 'itunes_type', podcast_show.itunes_type, 'description', podcast_show.description)
        END AS podcast_show,
    COALESCE(( SELECT json_agg(json_build_object('category_text', c.category_text, 'topic_id', c.topic_id, 'topic_slug', t.slug) ORDER BY c.category_text) AS json_agg
           FROM (rss_feed_categories c
             LEFT JOIN topics t ON (((t.id = c.topic_id) AND (t.deleted_at IS NULL) AND (t.merged_into_topic_id IS NULL))))
          WHERE (c.rss_feed_id = rss_feeds.id)), '[]'::json) AS categories
   FROM (((((((rss_feeds
     JOIN urls feed_url ON ((feed_url.id = rss_feeds.rss_feed_url_id)))
     JOIN url_hostnames feed_hostname ON ((feed_hostname.id = feed_url.hostname_id)))
     JOIN view_embedded_topics ON ((view_embedded_topics.id = rss_feeds.topic_id)))
     LEFT JOIN view_url_hostnames topic_hostname ON ((topic_hostname.id = view_embedded_topics.hostname_id)))
     JOIN view_rss_feed_current_states current_state ON ((current_state.rss_feed_id = rss_feeds.id)))
     LEFT JOIN LATERAL ( SELECT topics.id,
            topics.slug,
            topics.name,
            topics.topic_type
           FROM (relation__topic__publisher_type__topic relation
             JOIN topics ON ((topics.id = relation.object_id)))
          WHERE ((relation.subject_id = rss_feeds.topic_id) AND (relation.deleted_at IS NULL) AND (relation.votes_score_net > (0)::double precision) AND (topics.deleted_at IS NULL))
          ORDER BY relation.votes_score_net DESC NULLS LAST, relation.id
         LIMIT 1) publisher_type_topic ON (true))
     LEFT JOIN podcast_shows podcast_show ON ((podcast_show.rss_feed_id = rss_feeds.id)));
```

## `view_topic_metrics`

```sql
 SELECT 'topic_metrics'::text AS __entity_type,
    topic_id AS id,
    ( SELECT count(DISTINCT posts.id) AS count
           FROM ((( SELECT rel.subject_id AS post_id
                   FROM relation__post__category__topic rel
                  WHERE ((rel.object_id = topic_metrics.topic_id) AND (rel.deleted_at IS NULL) AND (rel.votes_score_net > (0)::double precision))
                UNION ALL
                 SELECT alias_relation.subject_id AS post_id
                   FROM (topic_aliases alias
                     JOIN relation__post__category__topic_alias alias_relation ON (((alias_relation.object_id = alias.id) AND (alias_relation.deleted_at IS NULL) AND (alias_relation.votes_score_net > (0)::double precision))))
                  WHERE (alias.topic_id = topic_metrics.topic_id)) candidate
             JOIN posts ON ((posts.id = candidate.post_id)))
             JOIN view_public_post_eligibility eligibility ON ((eligibility.post_id = posts.id)))
          WHERE (posts.post_type = 'discussion'::post_types)) AS count__discussions,
    ( SELECT count(DISTINCT posts.id) AS count
           FROM ((posts
             JOIN view_public_post_eligibility eligibility ON ((eligibility.post_id = posts.id)))
             JOIN post_review_topic_ratings prtr ON (((prtr.post_id = posts.id) AND (prtr.topic_id = topic_metrics.topic_id))))
          WHERE (posts.post_type = 'review'::post_types)) AS count__reviews,
    ( SELECT count(DISTINCT posts.id) AS count
           FROM ((posts
             JOIN view_public_post_eligibility eligibility ON ((eligibility.post_id = posts.id)))
             JOIN post_data_point_topics pdpt ON (((pdpt.post_id = posts.id) AND (pdpt.topic_id = topic_metrics.topic_id))))
          WHERE (posts.post_type = 'data_point'::post_types)) AS count__data_points,
    ( SELECT count(DISTINCT rfic.rss_feed_item_id) AS count
           FROM ((((rss_feed_item_categories rfic
             JOIN rss_feed_items rfi ON ((rfi.id = rfic.rss_feed_item_id)))
             JOIN rss_feed_item_sources rfis ON ((rfis.rss_feed_item_id = rfi.id)))
             JOIN rss_feeds rf ON ((rf.id = rfis.rss_feed_id)))
             JOIN view_rss_feed_current_states current_state ON ((current_state.rss_feed_id = rf.id)))
          WHERE ((rfic.topic_id = topic_metrics.topic_id) AND (rfi.deleted_at IS NULL) AND (rf.deleted_at IS NULL) AND (current_state.is_enabled = true) AND (current_state.is_discoverable = true))) AS count__news,
    ( SELECT count(DISTINCT rss_feed_items.id) AS count
           FROM (((rss_feed_items
             JOIN rss_feed_item_sources rfis ON ((rfis.rss_feed_item_id = rss_feed_items.id)))
             JOIN rss_feeds ON ((rss_feeds.id = rfis.rss_feed_id)))
             JOIN view_rss_feed_current_states current_state ON ((current_state.rss_feed_id = rss_feeds.id)))
          WHERE ((rss_feeds.topic_id = topic_metrics.topic_id) AND (rss_feeds.deleted_at IS NULL) AND (current_state.is_enabled = true) AND (current_state.is_discoverable = true) AND (rss_feed_items.deleted_at IS NULL))) AS count__latest,
    ratings__count__1,
    ratings__count__2,
    ratings__count__3,
    ratings__count__4,
    ratings__count__5,
    ratings__updated_at,
    bookmarks__follow_count,
    bookmarks__updated_at
   FROM topic_metrics;
```

## `view_topics`

```sql
 SELECT 'topic'::text AS __entity_type,
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
    ( SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id) AS jsonb_build_object
           FROM (image_surface_placements surface
             JOIN media_placements placement ON ((placement.id = surface.placement_id)))
          WHERE ((surface.surface_kind = 'topic-logo-image'::text) AND (surface.topic_id = topics.id) AND (placement.retired_at IS NULL) AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id))
          ORDER BY placement.id DESC
         LIMIT 1) AS logo_image_placement,
    ( SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id) AS jsonb_build_object
           FROM (image_surface_placements surface
             JOIN media_placements placement ON ((placement.id = surface.placement_id)))
          WHERE ((surface.surface_kind = 'topic-hero-image'::text) AND (surface.topic_id = topics.id) AND (placement.retired_at IS NULL) AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id))
          ORDER BY placement.id DESC
         LIMIT 1) AS hero_image_placement,
    topics.rewards_program_id,
    topics.referral_program_id,
    topics.aliases,
        CASE
            WHEN (view_url_hostnames.id IS NULL) THEN NULL::json
            ELSE json_build_object('__entity_type', view_url_hostnames.__entity_type, 'id', view_url_hostnames.id, 'hostname', view_url_hostnames.hostname, 'topic_id', view_url_hostnames.topic_id)
        END AS hostname,
    ( SELECT row_to_json(eu.*) AS row_to_json
           FROM view_embedded_users eu
          WHERE (eu.id = topics.created_by_id)) AS created_by,
    ( SELECT row_to_json(eu.*) AS row_to_json
           FROM view_embedded_users eu
          WHERE (eu.id = topics.updated_by_id)) AS updated_by,
    topics.lingua_rs_detected_language
   FROM (topics
     LEFT JOIN view_url_hostnames ON ((view_url_hostnames.id = topics.hostname_id)))
  WHERE ((topics.deleted_at IS NULL) AND (topics.merged_into_topic_id IS NULL));
```

## `view_url_hostnames`

```sql
 SELECT 'hostname'::text AS __entity_type,
    id,
    hostname,
    blocked,
    crawlable,
    skip_web_risk,
    link_rel_follow,
    topic_id,
    votes_score_net,
    votes_count_up,
    votes_count_down
   FROM url_hostnames;
```

## `view_urls`

```sql
 SELECT 'url'::text AS __entity_type,
    urls.id,
    urls.url,
    urls.pathname,
    urls.search_params,
    urls.canonical_url_id,
    row_to_json(view_url_hostnames.*) AS hostname
   FROM (urls
     JOIN view_url_hostnames ON ((urls.hostname_id = view_url_hostnames.id)));
```

## `view_user_metrics`

```sql
 SELECT 'user_metrics'::text AS __entity_type,
    id,
    bookmarks__follow__topics_count,
    bookmarks__follow__posts_count,
    bookmarks__follow__users_count,
    bookmarkers__follow_count,
    bookmarks__updated_at
   FROM user_metrics;
```

## `view_users_private`

```sql
 SELECT 'user'::text AS __entity_type,
    users.id,
    users.username,
    users.use_display_name_from,
    ( SELECT jsonb_build_object('id', fa.facebook_user_id, 'name', (fa.facebook_user_data ->> 'name'::text), 'email_address', fa.facebook_user_email_address) AS jsonb_build_object
           FROM facebook_accounts fa
          WHERE (fa.user_id = users.id)) AS facebook_account,
    user_email_addresses.email_address,
    user_phone_numbers.phone_number,
    ( SELECT COALESCE(array_agg(user_roles_types.slug), ARRAY[]::text[]) AS "coalesce"
           FROM (user_roles
             LEFT JOIN user_roles_types ON ((user_roles_types.id = user_roles.role_type_id)))
          WHERE (user_roles.user_id = users.id)) AS roles,
    users.individual_id,
    users.profile_image_id,
    ( SELECT jsonb_build_object('placement_id', placement.id, 'placement_revision', placement.revision, 'image_id', surface.image_id) AS jsonb_build_object
           FROM (image_surface_placements surface
             JOIN media_placements placement ON ((placement.id = surface.placement_id)))
          WHERE ((surface.surface_kind = 'user-profile-image'::text) AND (surface.user_id = users.id) AND (placement.retired_at IS NULL) AND fn_image_placement_publicly_projected(placement.id, placement.revision, surface.image_id))
          ORDER BY placement.id DESC
         LIMIT 1) AS profile_image_placement,
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
    ( SELECT jsonb_build_object('id', aa.apple_user_id, 'name', (aa.apple_user_data ->> 'name'::text), 'email_address', aa.apple_user_email_address) AS jsonb_build_object
           FROM apple_accounts aa
          WHERE (aa.user_id = users.id)) AS apple_account,
    ( SELECT jsonb_build_object('id', ga.google_user_id, 'name', (ga.google_user_data ->> 'name'::text), 'email_address', ga.google_user_email_address) AS jsonb_build_object
           FROM google_accounts ga
          WHERE (ga.user_id = users.id)) AS google_account,
    ( SELECT jsonb_build_object('id', xa.x_user_id, 'name', (xa.x_user_data ->> 'name'::text), 'email_address', xa.x_user_email_address) AS jsonb_build_object
           FROM x_accounts xa
          WHERE (xa.user_id = users.id)) AS x_account,
    ( SELECT jsonb_build_object('id', la.linkedin_user_id, 'name', (la.linkedin_user_data ->> 'name'::text), 'email_address', la.linkedin_user_email_address) AS jsonb_build_object
           FROM linkedin_accounts la
          WHERE (la.user_id = users.id)) AS linkedin_account,
    ( SELECT jsonb_build_object('id', ma.microsoft_user_id, 'name', (ma.microsoft_user_data ->> 'name'::text), 'email_address', ma.microsoft_user_email_address) AS jsonb_build_object
           FROM microsoft_accounts ma
          WHERE (ma.user_id = users.id)) AS microsoft_account,
    ( SELECT jsonb_build_object('id', gha.github_user_id, 'name', (gha.github_user_data ->> 'name'::text), 'email_address', gha.github_user_email_address) AS jsonb_build_object
           FROM github_accounts gha
          WHERE (gha.user_id = users.id)) AS github_account,
    (EXISTS ( SELECT 1
           FROM agents
          WHERE ((agents.system_user_id = users.id) AND (agents.deleted_at IS NULL)))) AS is_agent,
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
            WHEN ((users.verification_status = 'verified'::identity_verification_statuses) AND (users.verified_badge_visible = true)) THEN
            CASE users.public_verified_name_display
                WHEN 'first_name'::public_verified_name_displays THEN users.verified_first_name
                WHEN 'first_name_last_initial'::public_verified_name_displays THEN
                CASE
                    WHEN ((users.verified_first_name IS NOT NULL) AND (users.verified_last_name_initial IS NOT NULL)) THEN (((users.verified_first_name || ' '::text) || users.verified_last_name_initial) || '.'::text)
                    ELSE users.verified_first_name
                END
                WHEN 'full_name'::public_verified_name_displays THEN users.verified_full_name
                ELSE NULL::text
            END
            ELSE NULL::text
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
    ( SELECT jsonb_build_object('did', bla.bluesky_did, 'handle', bla.handle) AS jsonb_build_object
           FROM bluesky_linked_accounts bla
          WHERE ((bla.user_id = users.id) AND (bla.disconnect_requested_at IS NULL))) AS bluesky_account
   FROM ((((users
     LEFT JOIN user_email_addresses ON (((user_email_addresses.user_id = users.id) AND (user_email_addresses.is_primary = true))))
     LEFT JOIN user_phone_numbers ON (((user_phone_numbers.user_id = users.id) AND (user_phone_numbers.is_primary = true))))
     LEFT JOIN view_current_paid_memberships paid_membership ON ((paid_membership.user_id = users.id)))
     LEFT JOIN LATERAL ( SELECT user_suspensions.created_at AS suspended_at,
            user_suspensions.reason AS suspended_reason,
            user_suspensions.suspended_by_id
           FROM user_suspensions
          WHERE ((user_suspensions.user_id = users.id) AND (user_suspensions.lifted_at IS NULL))
          ORDER BY user_suspensions.id DESC
         LIMIT 1) susp ON (true))
  WHERE (users.deleted_at IS NULL);
```

## `view_users_public`

```sql
 SELECT e.__entity_type,
    e.id,
    e.username,
    e.use_display_name_from,
    e.display_account,
    e.profile_image_id,
    e.profile_image_placement,
    e.roles,
    e.is_official_account,
    u.markdown,
        CASE
            WHEN ((u.verification_status = 'verified'::identity_verification_statuses) AND (u.verified_badge_visible = true)) THEN u.verification_status
            ELSE NULL::identity_verification_statuses
        END AS verification_status,
        CASE
            WHEN ((u.verification_status = 'verified'::identity_verification_statuses) AND (u.verified_badge_visible = true)) THEN u.verified_badge_visible
            ELSE NULL::boolean
        END AS verified_badge_visible,
        CASE
            WHEN ((u.verification_status = 'verified'::identity_verification_statuses) AND (u.verified_badge_visible = true)) THEN u.public_verified_name_display
            ELSE NULL::public_verified_name_displays
        END AS public_verified_name_display,
        CASE
            WHEN ((u.verification_status = 'verified'::identity_verification_statuses) AND (u.verified_badge_visible = true)) THEN
            CASE u.public_verified_name_display
                WHEN 'first_name'::public_verified_name_displays THEN u.verified_first_name
                WHEN 'first_name_last_initial'::public_verified_name_displays THEN
                CASE
                    WHEN ((u.verified_first_name IS NOT NULL) AND (u.verified_last_name_initial IS NOT NULL)) THEN (((u.verified_first_name || ' '::text) || u.verified_last_name_initial) || '.'::text)
                    ELSE u.verified_first_name
                END
                WHEN 'full_name'::public_verified_name_displays THEN u.verified_full_name
                ELSE NULL::text
            END
            ELSE NULL::text
        END AS verified_display_name,
    u.lingua_rs_detected_language
   FROM (view_embedded_users e
     JOIN users u ON ((u.id = e.id)));
```
