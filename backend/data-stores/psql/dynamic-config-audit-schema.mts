// Typed previous/next columns for every registered dynamic config namespace.
// Field names and types are checked against the admin registry by
// backend/services/dynamic-config-admin/registry-audit-schema.test.mts.

export type DynamicConfigAuditFieldType = 'boolean' | 'number' | 'string'

export const DYNAMIC_CONFIG_AUDIT_FIELD_TYPES = {
  'feature-flags': {
    memberships: 'boolean',
    membershipStripeBilling: 'boolean',
    membershipAppleBilling: 'boolean',
    membershipGoogleBilling: 'boolean',
    membershipMicrosoftBilling: 'boolean',
    chat: 'boolean',
    combinedSearch: 'boolean',
    support: 'boolean',
    fediverse: 'boolean',
  },
  'membership-billing': {
    stripe_enabled: 'boolean',
    stripe_automatic_collision_resolution_enabled: 'boolean',
    apple_app_store_enabled: 'boolean',
    apple_app_store_automatic_collision_resolution_enabled: 'boolean',
    google_play_enabled: 'boolean',
    google_play_automatic_collision_resolution_enabled: 'boolean',
    microsoft_store_enabled: 'boolean',
    microsoft_store_automatic_collision_resolution_enabled: 'boolean',
  },
  'request-client-info': {
    enforcement_enabled: 'boolean',
  },
  'vote-weight-config': {
    multiplier_mfa: 'number',
    multiplier_has_oauth: 'number',
    multiplier_2_plus_oauth: 'number',
    multiplier_oauth_1_year: 'number',
    multiplier_oauth_5_years: 'number',
    multiplier_account_30_days: 'number',
    multiplier_account_1_year: 'number',
    multiplier_account_2_years: 'number',
    multiplier_account_5_years: 'number',
    weight_new_account: 'number',
    threshold_7_days_ms: 'number',
    threshold_30_days_ms: 'number',
    threshold_1_year_ms: 'number',
    threshold_2_years_ms: 'number',
    threshold_5_years_ms: 'number',
    multiplier_plus: 'number',
    multiplier_pro: 'number',
    multiplier_admin: 'number',
  },
  'recaptcha-config': {
    enabled: 'boolean',
    blocking_enabled: 'boolean',
    block_threshold: 'number',
  },
  'turnstile-config': {
    always_approve: 'boolean',
  },
  'post-content-limits-config': {
    data_point_topic_ids_max_items: 'number',
    review_topic_ratings_max_items: 'number',
  },
  'post-related-url-display-config': {
    summary_limit: 'number',
  },
  'rate-limit-thresholds': {
    read_tier0: 'number',
    read_tier1: 'number',
    read_tier2: 'number',
    read_tier3: 'number',
    read_tier4: 'number',
    read_tier5: 'number',
    write_tier0: 'number',
    write_tier1: 'number',
    write_tier2: 'number',
    write_tier3: 'number',
    write_tier4: 'number',
    write_tier5: 'number',
    sensitive_tier0: 'number',
    sensitive_tier1: 'number',
    sensitive_tier2: 'number',
    sensitive_tier3: 'number',
    sensitive_tier4: 'number',
    sensitive_tier5: 'number',
    read_ttl: 'number',
    write_ttl: 'number',
    sensitive_ttl: 'number',
  },
  'route-rate-limit-config': {
    enabled: 'boolean',
    anon_read: 'number',
    anon_write: 'number',
    anon_sensitive: 'number',
    anon_oauth_callback: 'number',
    anon_read_ttl: 'number',
    anon_write_ttl: 'number',
    anon_sensitive_ttl: 'number',
    anon_oauth_callback_ttl: 'number',
    attested_multiplier: 'number',
    activitypub_inbox_attempt_max_requests: 'number',
    activitypub_inbox_attempt_window_seconds: 'number',
    activitypub_inbox_max_requests: 'number',
    activitypub_inbox_window_seconds: 'number',
  },
  'contribution-rate-limits': {
    topic_just_joined_short_limit: 'number',
    topic_just_joined_short_window_seconds: 'number',
    topic_just_joined_daily_limit: 'number',
    topic_just_joined_daily_window_seconds: 'number',
    topic_free_short_limit: 'number',
    topic_free_short_window_seconds: 'number',
    topic_free_daily_limit: 'number',
    topic_free_daily_window_seconds: 'number',
    topic_plus_short_limit: 'number',
    topic_plus_short_window_seconds: 'number',
    topic_plus_daily_limit: 'number',
    topic_plus_daily_window_seconds: 'number',
    topic_pro_short_limit: 'number',
    topic_pro_short_window_seconds: 'number',
    topic_pro_daily_limit: 'number',
    topic_pro_daily_window_seconds: 'number',
    topic_admin_short_limit: 'number',
    topic_admin_short_window_seconds: 'number',
    topic_admin_daily_limit: 'number',
    topic_admin_daily_window_seconds: 'number',
    topic_recommendation_just_joined_short_limit: 'number',
    topic_recommendation_just_joined_short_window_seconds: 'number',
    topic_recommendation_just_joined_daily_limit: 'number',
    topic_recommendation_just_joined_daily_window_seconds: 'number',
    topic_recommendation_admin_short_limit: 'number',
    topic_recommendation_admin_short_window_seconds: 'number',
    topic_recommendation_admin_daily_limit: 'number',
    topic_recommendation_admin_daily_window_seconds: 'number',
    discussion_just_joined_short_limit: 'number',
    discussion_just_joined_short_window_seconds: 'number',
    discussion_just_joined_daily_limit: 'number',
    discussion_just_joined_daily_window_seconds: 'number',
    discussion_admin_short_limit: 'number',
    discussion_admin_short_window_seconds: 'number',
    discussion_admin_daily_limit: 'number',
    discussion_admin_daily_window_seconds: 'number',
    review_just_joined_short_limit: 'number',
    review_just_joined_short_window_seconds: 'number',
    review_just_joined_daily_limit: 'number',
    review_just_joined_daily_window_seconds: 'number',
    review_admin_short_limit: 'number',
    review_admin_short_window_seconds: 'number',
    review_admin_daily_limit: 'number',
    review_admin_daily_window_seconds: 'number',
    comment_just_joined_short_limit: 'number',
    comment_just_joined_short_window_seconds: 'number',
    comment_just_joined_daily_limit: 'number',
    comment_just_joined_daily_window_seconds: 'number',
    comment_admin_short_limit: 'number',
    comment_admin_short_window_seconds: 'number',
    comment_admin_daily_limit: 'number',
    comment_admin_daily_window_seconds: 'number',
    data_point_just_joined_short_limit: 'number',
    data_point_just_joined_short_window_seconds: 'number',
    data_point_just_joined_daily_limit: 'number',
    data_point_just_joined_daily_window_seconds: 'number',
    data_point_admin_short_limit: 'number',
    data_point_admin_short_window_seconds: 'number',
    data_point_admin_daily_limit: 'number',
    data_point_admin_daily_window_seconds: 'number',
    community_just_joined_short_limit: 'number',
    community_just_joined_short_window_seconds: 'number',
    community_just_joined_daily_limit: 'number',
    community_just_joined_daily_window_seconds: 'number',
    community_free_short_limit: 'number',
    community_free_short_window_seconds: 'number',
    community_free_daily_limit: 'number',
    community_free_daily_window_seconds: 'number',
    community_plus_short_limit: 'number',
    community_plus_short_window_seconds: 'number',
    community_plus_daily_limit: 'number',
    community_plus_daily_window_seconds: 'number',
    community_pro_short_limit: 'number',
    community_pro_short_window_seconds: 'number',
    community_pro_daily_limit: 'number',
    community_pro_daily_window_seconds: 'number',
    community_admin_short_limit: 'number',
    community_admin_short_window_seconds: 'number',
    community_admin_daily_limit: 'number',
    community_admin_daily_window_seconds: 'number',
    rss_feed_just_joined_short_limit: 'number',
    rss_feed_just_joined_short_window_seconds: 'number',
    rss_feed_just_joined_daily_limit: 'number',
    rss_feed_just_joined_daily_window_seconds: 'number',
    rss_feed_free_short_limit: 'number',
    rss_feed_free_short_window_seconds: 'number',
    rss_feed_free_daily_limit: 'number',
    rss_feed_free_daily_window_seconds: 'number',
    rss_feed_plus_short_limit: 'number',
    rss_feed_plus_short_window_seconds: 'number',
    rss_feed_plus_daily_limit: 'number',
    rss_feed_plus_daily_window_seconds: 'number',
    rss_feed_pro_short_limit: 'number',
    rss_feed_pro_short_window_seconds: 'number',
    rss_feed_pro_daily_limit: 'number',
    rss_feed_pro_daily_window_seconds: 'number',
    rss_feed_admin_short_limit: 'number',
    rss_feed_admin_short_window_seconds: 'number',
    rss_feed_admin_daily_limit: 'number',
    rss_feed_admin_daily_window_seconds: 'number',
    post_rating_just_joined_short_limit: 'number',
    post_rating_just_joined_short_window_seconds: 'number',
    post_rating_just_joined_daily_limit: 'number',
    post_rating_just_joined_daily_window_seconds: 'number',
    post_rating_free_short_limit: 'number',
    post_rating_free_short_window_seconds: 'number',
    post_rating_free_daily_limit: 'number',
    post_rating_free_daily_window_seconds: 'number',
    post_rating_plus_short_limit: 'number',
    post_rating_plus_short_window_seconds: 'number',
    post_rating_plus_daily_limit: 'number',
    post_rating_plus_daily_window_seconds: 'number',
    post_rating_pro_short_limit: 'number',
    post_rating_pro_short_window_seconds: 'number',
    post_rating_pro_daily_limit: 'number',
    post_rating_pro_daily_window_seconds: 'number',
    post_rating_admin_short_limit: 'number',
    post_rating_admin_short_window_seconds: 'number',
    post_rating_admin_daily_limit: 'number',
    post_rating_admin_daily_window_seconds: 'number',
    fediverse_instance_just_joined_short_limit: 'number',
    fediverse_instance_just_joined_short_window_seconds: 'number',
    fediverse_instance_just_joined_daily_limit: 'number',
    fediverse_instance_just_joined_daily_window_seconds: 'number',
    fediverse_instance_free_short_limit: 'number',
    fediverse_instance_free_short_window_seconds: 'number',
    fediverse_instance_free_daily_limit: 'number',
    fediverse_instance_free_daily_window_seconds: 'number',
    fediverse_instance_plus_short_limit: 'number',
    fediverse_instance_plus_short_window_seconds: 'number',
    fediverse_instance_plus_daily_limit: 'number',
    fediverse_instance_plus_daily_window_seconds: 'number',
    fediverse_instance_pro_short_limit: 'number',
    fediverse_instance_pro_short_window_seconds: 'number',
    fediverse_instance_pro_daily_limit: 'number',
    fediverse_instance_pro_daily_window_seconds: 'number',
    fediverse_instance_admin_short_limit: 'number',
    fediverse_instance_admin_short_window_seconds: 'number',
    fediverse_instance_admin_daily_limit: 'number',
    fediverse_instance_admin_daily_window_seconds: 'number',
    authored_post_free_short_limit: 'number',
    authored_post_free_short_window_seconds: 'number',
    authored_post_free_daily_limit: 'number',
    authored_post_free_daily_window_seconds: 'number',
    authored_post_plus_short_limit: 'number',
    authored_post_plus_short_window_seconds: 'number',
    authored_post_plus_daily_limit: 'number',
    authored_post_plus_daily_window_seconds: 'number',
    authored_post_pro_short_limit: 'number',
    authored_post_pro_short_window_seconds: 'number',
    authored_post_pro_daily_limit: 'number',
    authored_post_pro_daily_window_seconds: 'number',
    authored_post_safety_short_limit: 'number',
    authored_post_safety_short_window_seconds: 'number',
    authored_post_safety_daily_limit: 'number',
    authored_post_safety_daily_window_seconds: 'number',
    topic_recommendation_free_short_limit: 'number',
    topic_recommendation_free_short_window_seconds: 'number',
    topic_recommendation_free_daily_limit: 'number',
    topic_recommendation_free_daily_window_seconds: 'number',
    topic_recommendation_plus_short_limit: 'number',
    topic_recommendation_plus_short_window_seconds: 'number',
    topic_recommendation_plus_daily_limit: 'number',
    topic_recommendation_plus_daily_window_seconds: 'number',
    topic_recommendation_pro_short_limit: 'number',
    topic_recommendation_pro_short_window_seconds: 'number',
    topic_recommendation_pro_daily_limit: 'number',
    topic_recommendation_pro_daily_window_seconds: 'number',
    topic_recommendation_safety_short_limit: 'number',
    topic_recommendation_safety_short_window_seconds: 'number',
    topic_recommendation_safety_daily_limit: 'number',
    topic_recommendation_safety_daily_window_seconds: 'number',
    discussion_free_short_limit: 'number',
    discussion_free_short_window_seconds: 'number',
    discussion_free_daily_limit: 'number',
    discussion_free_daily_window_seconds: 'number',
    discussion_plus_short_limit: 'number',
    discussion_plus_short_window_seconds: 'number',
    discussion_plus_daily_limit: 'number',
    discussion_plus_daily_window_seconds: 'number',
    discussion_pro_short_limit: 'number',
    discussion_pro_short_window_seconds: 'number',
    discussion_pro_daily_limit: 'number',
    discussion_pro_daily_window_seconds: 'number',
    discussion_safety_short_limit: 'number',
    discussion_safety_short_window_seconds: 'number',
    discussion_safety_daily_limit: 'number',
    discussion_safety_daily_window_seconds: 'number',
    review_free_short_limit: 'number',
    review_free_short_window_seconds: 'number',
    review_free_daily_limit: 'number',
    review_free_daily_window_seconds: 'number',
    review_plus_short_limit: 'number',
    review_plus_short_window_seconds: 'number',
    review_plus_daily_limit: 'number',
    review_plus_daily_window_seconds: 'number',
    review_pro_short_limit: 'number',
    review_pro_short_window_seconds: 'number',
    review_pro_daily_limit: 'number',
    review_pro_daily_window_seconds: 'number',
    review_safety_short_limit: 'number',
    review_safety_short_window_seconds: 'number',
    review_safety_daily_limit: 'number',
    review_safety_daily_window_seconds: 'number',
    comment_free_short_limit: 'number',
    comment_free_short_window_seconds: 'number',
    comment_free_daily_limit: 'number',
    comment_free_daily_window_seconds: 'number',
    comment_plus_short_limit: 'number',
    comment_plus_short_window_seconds: 'number',
    comment_plus_daily_limit: 'number',
    comment_plus_daily_window_seconds: 'number',
    comment_pro_short_limit: 'number',
    comment_pro_short_window_seconds: 'number',
    comment_pro_daily_limit: 'number',
    comment_pro_daily_window_seconds: 'number',
    comment_safety_short_limit: 'number',
    comment_safety_short_window_seconds: 'number',
    comment_safety_daily_limit: 'number',
    comment_safety_daily_window_seconds: 'number',
    data_point_free_short_limit: 'number',
    data_point_free_short_window_seconds: 'number',
    data_point_free_daily_limit: 'number',
    data_point_free_daily_window_seconds: 'number',
    data_point_plus_short_limit: 'number',
    data_point_plus_short_window_seconds: 'number',
    data_point_plus_daily_limit: 'number',
    data_point_plus_daily_window_seconds: 'number',
    data_point_pro_short_limit: 'number',
    data_point_pro_short_window_seconds: 'number',
    data_point_pro_daily_limit: 'number',
    data_point_pro_daily_window_seconds: 'number',
    data_point_safety_short_limit: 'number',
    data_point_safety_short_window_seconds: 'number',
    data_point_safety_daily_limit: 'number',
    data_point_safety_daily_window_seconds: 'number',
  },
  'bloom-filter-config': {
    entityCacheBloomFilterEnabled: 'boolean',
    embeddingBloomFilterEnabled: 'boolean',
    urlBlocklistBloomFilterEnabled: 'boolean',
    emailBlocklistBloomFilterEnabled: 'boolean',
    bookmarkBloomFilterEnabled: 'boolean',
    apiKeyBloomFilterEnabled: 'boolean',
  },
  'rss-feed-discoverability-config': {
    enabled: 'boolean',
    make_discoverable_min_net_score: 'number',
    make_discoverable_alt_min_net_score: 'number',
    make_discoverable_min_subscriptions: 'number',
    make_undiscoverable_max_net_score: 'number',
  },
  'moderation-config': {
    ai_generated_confidence_threshold: 'number',
  },
  'bedrock-embeddings-batch-config': {
    max_inflight_jobs: 'number',
    max_requests_per_hour: 'number',
    max_requests_per_file: 'number',
    max_file_size_gb: 'number',
    max_job_size_gb: 'number',
    min_records_per_job: 'number',
    backlog_threshold: 'number',
    stale_ttl_hours: 'number',
  },
  'rss-feed-crawl-config': {
    enabled: 'boolean',
    ignore_robots_txt: 'boolean',
    tier1_sla_ms: 'number',
    tier2_sla_ms: 'number',
    tier3_sla_ms: 'number',
    tier4_sla_ms: 'number',
    tier5_sla_ms: 'number',
    capacity_budget: 'number',
  },
  'user-import-export-config': {
    sync_export_max_items: 'number',
  },
  'web-risk-config': {
    enabled: 'boolean',
  },
  'moderation-ai-config': {
    community_judgement_enabled: 'boolean',
  },
  'moderation-ai-dispatch-config': {
    auto_dispatch_enabled: 'boolean',
    auto_dispatch_remove: 'boolean',
    auto_dispatch_warn: 'boolean',
    auto_dispatch_no_action: 'boolean',
  },
  'openai-spend-cap': {
    enabled: 'boolean',
    daily_cap_microunits: 'number',
  },
  'manual-tag-limits': {
    just_joined: 'number',
    free: 'number',
    plus: 'number',
    pro: 'number',
  },
  'autotagger-paid-limits': {
    enabled: 'boolean',
    post_free_max_topics: 'number',
    post_plus_max_topics: 'number',
    post_pro_max_topics: 'number',
    rss_discoverable_llm_max_topics: 'number',
    rss_collaborative_plus_max_topics: 'number',
    rss_collaborative_pro_max_topics: 'number',
  },
  'kagi-smallweb-config': {
    enabled: 'boolean',
  },
  'app-attestation-config': {
    enabled: 'boolean',
    require_attestation_for_bypass: 'boolean',
    allow_development_attestation: 'boolean',
    request_signing_mode: 'string',
  },
  'activitypub-inbox': {
    async_delivery_enabled: 'boolean',
  },
  'oauth-authorization-broker': {
    facebook_web_enabled: 'boolean',
    facebook_native_enabled: 'boolean',
    x_web_enabled: 'boolean',
    x_native_enabled: 'boolean',
    github_web_enabled: 'boolean',
    github_native_enabled: 'boolean',
  },
  'api-egress-proxy': {
    stripe_enabled: 'boolean',
    openai_moderation_enabled: 'boolean',
    apple_oauth_enabled: 'boolean',
    github_oauth_enabled: 'boolean',
    x_oauth_enabled: 'boolean',
    bluesky_oauth_enabled: 'boolean',
    fediverse_search_enabled: 'boolean',
    bedrock_embeddings_enabled: 'boolean',
  },
} as const

export type DynamicConfigAuditNamespace = keyof typeof DYNAMIC_CONFIG_AUDIT_FIELD_TYPES

export type DynamicConfigAuditField = {
  name: string
  type: DynamicConfigAuditFieldType
  previous: string
  next: string
}

export type DynamicConfigAuditSchema = {
  namespace: DynamicConfigAuditNamespace
  table: string
  fields: DynamicConfigAuditField[]
}

const SQL_TYPE = {
  boolean: 'BOOLEAN',
  number: 'DOUBLE PRECISION',
  string: 'TEXT',
} as const

export function dynamicConfigAuditTable(namespace: string): string {
  const table = `dynamic_config_audit_${namespace.replaceAll('-', '_')}_facts`
  if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`Invalid dynamic config audit table: ${table}`)
  return table
}

function auditColumnName(side: 'previous' | 'next', field: string): string {
  const name = `${side}_${field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`
  if (!/^[a-z][a-z0-9_]*$/.test(name) || name.length > 63) {
    throw new Error(`Invalid dynamic config audit column: ${name}`)
  }
  return name
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length > 63) {
    throw new Error(`Invalid dynamic config audit identifier: ${name}`)
  }
  return `"${name}"`
}

export function dynamicConfigAuditSchemas(): DynamicConfigAuditSchema[] {
  return Object.entries(DYNAMIC_CONFIG_AUDIT_FIELD_TYPES).map(([namespace, fieldTypes]) => ({
    namespace: namespace as DynamicConfigAuditNamespace,
    table: dynamicConfigAuditTable(namespace),
    fields: Object.entries(fieldTypes).map(([name, type]) => ({
      name,
      type: type as DynamicConfigAuditFieldType,
      previous: auditColumnName('previous', name),
      next: auditColumnName('next', name),
    })),
  }))
}

export const DYNAMIC_CONFIG_AUDIT_TABLES = Object.keys(DYNAMIC_CONFIG_AUDIT_FIELD_TYPES).map(
  namespace => dynamicConfigAuditTable(namespace),
)

export function dynamicConfigAuditSchema(namespace: string): DynamicConfigAuditSchema | undefined {
  return dynamicConfigAuditSchemas().find(schema => schema.namespace === namespace)
}

export function dynamicConfigAuditDdl(): string {
  const schemas = dynamicConfigAuditSchemas()
  const keys = schemas.map(schema => `'${schema.namespace}'`).join(', ')
  const tables = schemas.map(renderAuditTable).join('\n\n')
  return `${tables}

ALTER TABLE dynamic_config_change_logs
  DROP CONSTRAINT IF EXISTS dynamic_config_change_logs_config_key_check;

ALTER TABLE dynamic_config_change_logs
  ADD CONSTRAINT dynamic_config_change_logs_config_key_check
  CHECK (config_key IN (${keys}))
  NOT VALID;

ALTER TABLE dynamic_config_change_logs
  VALIDATE CONSTRAINT dynamic_config_change_logs_config_key_check;

${renderAuditFieldFunction(schemas)}`
}

function renderAuditTable(schema: DynamicConfigAuditSchema): string {
  const columns = schema.fields.flatMap(field => [
    `${quoteIdent(field.previous)} ${SQL_TYPE[field.type]}`,
    `${quoteIdent(field.next)} ${SQL_TYPE[field.type]}`,
  ])
  const comments = [
    `COMMENT ON TABLE ${schema.table} IS 'Typed previous and next values for ${schema.namespace} dynamic config audits.';`,
    `COMMENT ON COLUMN ${schema.table}.change_id IS 'Dynamic config audit row these field values belong to.';`,
    ...schema.fields.flatMap(field => [
      `COMMENT ON COLUMN ${schema.table}.${quoteIdent(field.previous)} IS 'Previous ${field.name} value; null when the audited snapshot omitted that key.';`,
      `COMMENT ON COLUMN ${schema.table}.${quoteIdent(field.next)} IS 'Next ${field.name} value; null when the audited snapshot omitted that key.';`,
    ]),
  ]
  return `CREATE TABLE IF NOT EXISTS ${schema.table} (
  change_id UUID PRIMARY KEY REFERENCES dynamic_config_change_logs (id) ON DELETE CASCADE,
  ${columns.join(',\n  ')}
);

${comments.join('\n')}`
}

function renderAuditFieldFunction(schemas: DynamicConfigAuditSchema[]): string {
  const branches = schemas.map(schema => {
    const previous = schema.fields
      .map(field => `${quoteIdent(field.previous)} AS ${quoteIdent(field.name)}`)
      .join(',\n          ')
    const next = schema.fields
      .map(field => `${quoteIdent(field.next)} AS ${quoteIdent(field.name)}`)
      .join(',\n          ')
    return `    WHEN '${schema.namespace}' THEN CASE p_side
      WHEN 'previous' THEN (
        SELECT jsonb_strip_nulls(to_jsonb(snapshot))
        FROM (
          SELECT ${previous}
          FROM ${schema.table}
          WHERE change_id = p_change_id
        ) snapshot
      )
      WHEN 'next' THEN (
        SELECT jsonb_strip_nulls(to_jsonb(snapshot))
        FROM (
          SELECT ${next}
          FROM ${schema.table}
          WHERE change_id = p_change_id
        ) snapshot
      )
      ELSE NULL
    END`
  })
  return `CREATE OR REPLACE FUNCTION fn_dynamic_config_change_fields(
  p_change_id UUID,
  p_config_key TEXT,
  p_side TEXT
) RETURNS JSONB
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE p_config_key
${branches.join('\n')}
    ELSE NULL
  END
$fn$;

COMMENT ON FUNCTION fn_dynamic_config_change_fields(UUID, TEXT, TEXT) IS
  'Rebuilds one audited dynamic config snapshot side from its typed namespace columns.';`
}
