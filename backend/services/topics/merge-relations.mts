import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'

export const relationReferences = {
  relation__community__mute__topic: ['object_id'],
  relation__post__category__topic: ['object_id'],
  relation__post__mentioned__topic: ['object_id'],
  relation__rss_feed_item__category__topic: ['object_id'],
  relation__topic__category__topic: ['object_id', 'subject_id'],
  relation__topic__faq__post: ['subject_id'],
  relation__topic__faq__url: ['subject_id'],
  relation__topic__guide__url: ['subject_id'],
  relation__topic__landing_page__url: ['subject_id'],
  relation__topic__mentioned__post: ['subject_id'],
  relation__topic__parent__topic: ['object_id', 'subject_id'],
  relation__topic__publisher_type__topic: ['object_id', 'subject_id'],
  relation__topic__related__post: ['subject_id'],
  relation__topic__related__topic: ['object_id', 'subject_id'],
  relation__topic__related__url: ['subject_id'],
  relation__topic__terms_of_service__url: ['subject_id'],
  relation__user__block__topic: ['object_id'],
  relation__user__category__topic: ['object_id'],
  relation__user__dismiss_recommendation__topic: ['object_id'],
  relation__user__follow__topic: ['object_id'],
  relation__user__mute__topic: ['object_id'],
  relation__user__subscribe_posts__topic: ['object_id'],
  relation__user__subscribe_rss_feed_items__topic: ['object_id'],
} as const

export const relationElectionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)
