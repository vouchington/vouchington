import { DYNAMIC_CONFIG_AUDIT_TABLES } from './dynamic-config-audit-schema.mts'

const AUDIT_FACT_TABLES = [
  'moderator_action_restrictions',
  'moderator_action_topic_slugs',
  'post_moderation_disposition_categories',
  'post_moderation_disposition_signals',
  'post_revision_categories',
  'post_revision_data_point_topics',
  'post_revision_data_points',
  'post_revision_images',
  'post_revision_rating_topics',
  'report_integrity_flag_reporters',
  'retained_community_agent_prompt_identities',
  'retained_community_identities',
  'retained_community_restriction_identities',
  'retained_post_admission_reservation_identities',
  'retained_topic_alias_identities',
  'retained_url_hostname_identities',
  'retained_url_identities',
  'topic_revision_alias_entries',
  'vote_integrity_flag_ips',
] as const

export const AUDIT_GROWTH_TABLES = [...DYNAMIC_CONFIG_AUDIT_TABLES, ...AUDIT_FACT_TABLES]
