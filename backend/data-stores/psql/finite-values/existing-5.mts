import { MODERATION_CLEANUP_KINDS } from '@voucha/types/entities/moderation-retention'

// Existing enums retain their original creators; this catalog types their current consumers.
export const EXISTING_FINITE_VALUES_5 = {
  moderation_record_cleanup_kinds: MODERATION_CLEANUP_KINDS,
  retained_identity_families: ['user', 'api_key', 'topic', 'post', 'rss_feed_item', 'membership'],
  retained_identity_cleanup_families: [
    'user',
    'api_key',
    'topic',
    'post',
    'rss_feed_item',
    'image',
    'membership',
  ],
  revision_types: ['create', 'update', 'delete'],
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
