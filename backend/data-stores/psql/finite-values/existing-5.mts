// Existing enums retain their original creators; this catalog types their current consumers.
export const EXISTING_FINITE_VALUES_5 = {
  retained_identity_families: [
    'user',
    'api_key',
    'topic',
    'post',
    'post_clearance_change',
    'rss_feed_item',
    'membership',
  ],
  retained_identity_cleanup_families: [
    'user',
    'api_key',
    'topic',
    'post',
    'post_clearance_change',
    'rss_feed_item',
    'image',
    'membership',
  ],
  revision_types: ['create', 'update', 'delete'],
  content_history_cleanup_families: [
    'topic_revisions',
    'post_moderation_versions',
    'post_moderation_dispositions',
    'agent_moderations',
  ],
  user_display_name_sources: [
    'username',
    'facebook',
    'x',
    'apple',
    'google',
    'linkedin',
    'microsoft',
    'github',
  ],
} as const
