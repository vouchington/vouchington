/**
 * The ID of the tombstone "deleted" user.
 * Posts are reassigned to this user when the original creator deletes their account.
 * UUIDv7 at Unix epoch 0: timestamp bits are all zero so uuid_extract_timestamp() returns
 * 1970-01-01 rather than NULL.
 */
export const DELETED_USER_ID = '00000000-0000-7000-8000-000000000000'
export const BAN_EVASION_SYSTEM_USERNAME = 'ban-evasion'
export const MODERATION_SYSTEM_USERNAME = 'automod'
export const AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME = 'autotagger-classifier'
export const STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME = 'story-clustering-classifier'
export const RSS_FEED_AUTO_UPDATER_USERNAME = 'rss-feed-auto-updater'
export const RSS_FEED_CATEGORIZER_USERNAME = 'rss-feed-categorizer'
export const RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME = 'rss-feed-collaborative-categorizer'
