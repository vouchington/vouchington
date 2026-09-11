export const CAPTURE_SYMBOLS = new Set([
  'recordPostPublicationChange',
  'recordPostPublicationChanges',
  'recordAuthorDeletionBeforePostReassignment',
  'recordRssFeedHardDeletePublicationChange',
  'recordCreatedPostPublicationChange',
  'recordPostUpdatePublicationChanges',
  'recordPostClearancePublicationChange',
  'recordCommunityPublicationChange',
  'recordRssFeedDiscoverabilityPublicationChange',
  'recordRssFeedStatePublicationChange',
  'recordStoryPostPublicationChanges',
  'recordPostTopicRelationPublicationChanges',
  'recordPostRelatedUrlPublicationChanges',
  'recordPreparedAuthorDeletionPublicationWork',
  'recordUserDeletionPublicationCapture',
  'runRelationPublicationMutation',
  'recordTopicAliasPublicationChanges',
  'recordStoryPublicationChangesForCategoryTopics',
  'recordUserDeletionRelationPublicationChanges',
])

export const CAPTURE_IMPORT_MODULE_SPECIFIERS = new Set([
  '@services/entity-relations',
  '@services/entity-relations/post-topic-publication',
  '@services/post-publication',
  './create/publication-change.mts',
  './capture.mts',
  './delete-publication-capture.mts',
  './delete-entity-relation-votes.mts',
  './publication-change.mts',
  './publication-mutation.mts',
  './post-topic-publication.mts',
  './story-publication-change.mts',
  './update/publication-change.mts',
])

export const ELIGIBILITY_TABLES = new Set(
  'posts post_review_topic_ratings post_clearance_changes community_post_reviews communities user_suspensions rss_feeds rss_feed_items rss_feed_item_sources rss_feed_item_categories rss_feed_discoverability_changes rss_feed_enablement_changes post__stories stories relation__post__category__topic relation__post__category__topic_alias relation__post__related__url relation__topic__publisher_type__topic topic_aliases'.split(
    ' ',
  ),
)
