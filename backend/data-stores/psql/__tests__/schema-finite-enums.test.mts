import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'

const finiteEnumColumns = [
  {
    table: 'api_keys',
    column: 'type',
    type: 'api_key_types',
    labels: ['rss', 'mcp'],
  },
  {
    table: 'app_attestation_keys',
    column: 'environment',
    type: 'app_attestation_environments',
    labels: ['production', 'development'],
  },
  {
    table: 'community_application_questions',
    column: 'field_type',
    type: 'community_application_question_field_types',
    labels: ['short_text', 'long_text', 'single_select', 'multi_select', 'checkbox'],
  },
  {
    table: 'follower_distributions',
    column: 'action',
    type: 'follower_distribution_actions',
    labels: ['post_share', 'post_send', 'rss_feed_item_share', 'rss_feed_item_send'],
  },
  {
    table: 'follower_distributions',
    column: 'audience',
    type: 'follower_distribution_audiences',
    labels: ['all_followers', 'selected_followers'],
  },
  {
    table: 'moderation_appeal_lifecycle_changes',
    column: 'change_type',
    type: 'moderation_appeal_lifecycle_change_types',
    labels: [
      'create',
      'ai_draft',
      'edit',
      'approve',
      'send',
      'resolve_accept',
      'resolve_deny',
      'resolve_reduce',
      'dismiss',
    ],
  },
  {
    table: 'moderation_appeals',
    column: 'post_removal_kind',
    type: 'moderation_appeal_post_removal_kinds',
    labels: ['platform', 'community'],
  },
  {
    table: 'moderation_media_reveals',
    column: 'surface',
    type: 'moderation_media_reveal_surfaces',
    labels: ['mod_queue', 'review_queue', 'reports', 'post_page'],
  },
  {
    table: 'moderator_actions',
    column: 'action_type',
    type: 'moderator_action_types',
    labels: [
      'remove',
      'approve',
      'reject',
      'ban',
      'lift_ban',
      'activate_restriction',
      'lift_restriction',
      'warn',
      'lock',
      'unlock',
      'pin',
      'unpin',
      'tag',
      'suspend',
      'unsuspend',
      'remove_member',
      'change_role',
      'resolve_report',
      'dismiss_report',
      'resolve_appeal',
      'dismiss_appeal',
    ],
  },
  {
    table: 'podcast_shows',
    column: 'itunes_type',
    type: 'podcast_itunes_types',
    labels: ['episodic', 'serial'],
  },
  {
    table: 'post_topic_recommendations',
    column: 'topic_type',
    type: 'post_topic_recommendation_topic_types',
    labels: ['topic', 'referral_program', 'card'],
  },
  {
    table: 'review_dispute_lifecycle_changes',
    column: 'change_type',
    type: 'review_dispute_lifecycle_change_types',
    labels: [
      'create',
      'ai_draft',
      'edit',
      'approve',
      'send',
      'resolve_remove',
      'resolve_annotate',
      'dismiss',
    ],
  },
  {
    table: 'users',
    column: 'moderation_email_cadence',
    type: 'moderation_email_cadences',
    labels: ['daily', 'selected_days', 'weekly'],
  },
] as const

describe('PostgreSQL finite enums', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('uses named enums for finite domain columns', async () => {
    const { rows } = await read<{ column_key: string; type_name: string }>(
      `/* getFiniteEnumColumnTypes */
        SELECT
          table_name || '.' || column_name AS column_key,
          udt_name AS type_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name || '.' || column_name = ANY($1)
        ORDER BY column_key`,
      [finiteEnumColumns.map(definition => `${definition.table}.${definition.column}`)],
    )

    expect(rows).toEqual(
      finiteEnumColumns
        .map(definition => ({
          column_key: `${definition.table}.${definition.column}`,
          type_name: definition.type,
        }))
        .toSorted((left, right) => left.column_key.localeCompare(right.column_key)),
    )
  })

  it('keeps each finite domain enum label set exact', async () => {
    const { rows } = await read<{ type_name: string; labels: string[] }>(
      `/* getFiniteEnumLabels */
        SELECT
          type_definition.typname AS type_name,
          jsonb_agg(enum_definition.enumlabel ORDER BY enum_definition.enumsortorder) AS labels
        FROM pg_type type_definition
        JOIN pg_namespace namespace
          ON namespace.oid = type_definition.typnamespace
        JOIN pg_enum enum_definition
          ON enum_definition.enumtypid = type_definition.oid
        WHERE namespace.nspname = 'public'
          AND type_definition.typname = ANY($1)
        GROUP BY type_definition.typname
        ORDER BY type_definition.typname`,
      [finiteEnumColumns.map(definition => definition.type)],
    )

    expect(rows).toEqual(
      finiteEnumColumns
        .map(definition => ({ type_name: definition.type, labels: [...definition.labels] }))
        .toSorted((left, right) => left.type_name.localeCompare(right.type_name)),
    )
  })
})
