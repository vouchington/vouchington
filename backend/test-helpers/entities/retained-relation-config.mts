type RetainedRelationConfig = Readonly<{
  retainedTable: string
  integrityTargetColumn: string
}>

// Literal identifiers keep fixture SQL independent of the mutable relation metadata registry.
// The parity test requires every elected family and rejects every non-elected family.
const retainedRelationConfigs = Object.freeze({
  relation__user__category__topic: Object.freeze({
    retainedTable: 'retained_relation__user__category__topic',
    integrityTargetColumn: 'relation__user__category__topic_id',
  }),
  relation__post__category__topic: Object.freeze({
    retainedTable: 'retained_relation__post__category__topic',
    integrityTargetColumn: 'relation__post__category__topic_id',
  }),
  relation__post__category__topic_alias: Object.freeze({
    retainedTable: 'retained_relation__post__category__topic_alias',
    integrityTargetColumn: 'relation__post__category__topic_alias_id',
  }),
  relation__post__related__post: Object.freeze({
    retainedTable: 'retained_relation__post__related__post',
    integrityTargetColumn: 'relation__post__related__post_id',
  }),
  relation__post__related__url: Object.freeze({
    retainedTable: 'retained_relation__post__related__url',
    integrityTargetColumn: 'relation__post__related__url_id',
  }),
  relation__topic__related__topic: Object.freeze({
    retainedTable: 'retained_relation__topic__related__topic',
    integrityTargetColumn: 'relation__topic__related__topic_id',
  }),
  relation__topic__category__topic: Object.freeze({
    retainedTable: 'retained_relation__topic__category__topic',
    integrityTargetColumn: 'relation__topic__category__topic_id',
  }),
  relation__topic__publisher_type__topic: Object.freeze({
    retainedTable: 'retained_relation__topic__publisher_type__topic',
    integrityTargetColumn: 'relation__topic__publisher_type__topic_id',
  }),
  relation__topic__faq__post: Object.freeze({
    retainedTable: 'retained_relation__topic__faq__post',
    integrityTargetColumn: 'relation__topic__faq__post_id',
  }),
  relation__topic__related__post: Object.freeze({
    retainedTable: 'retained_relation__topic__related__post',
    integrityTargetColumn: 'relation__topic__related__post_id',
  }),
  relation__topic__related__url: Object.freeze({
    retainedTable: 'retained_relation__topic__related__url',
    integrityTargetColumn: 'relation__topic__related__url_id',
  }),
  relation__topic__faq__url: Object.freeze({
    retainedTable: 'retained_relation__topic__faq__url',
    integrityTargetColumn: 'relation__topic__faq__url_id',
  }),
  relation__topic__guide__url: Object.freeze({
    retainedTable: 'retained_relation__topic__guide__url',
    integrityTargetColumn: 'relation__topic__guide__url_id',
  }),
  relation__topic__landing_page__url: Object.freeze({
    retainedTable: 'retained_relation__topic__landing_page__url',
    integrityTargetColumn: 'relation__topic__landing_page__url_id',
  }),
  relation__topic__terms_of_service__url: Object.freeze({
    retainedTable: 'retained_relation__topic__terms_of_service__url',
    integrityTargetColumn: 'relation__topic__terms_of_service__url_id',
  }),
  relation__rss_feed_item__category__topic: Object.freeze({
    retainedTable: 'retained_relation__rss_feed_item__category__topic',
    integrityTargetColumn: 'relation__rss_feed_item__category__topic_id',
  }),
  relation__rss_feed_item__category__topic_alias: Object.freeze({
    retainedTable: 'retained_relation__rss_feed_item__category__topic_alias',
    integrityTargetColumn: 'relation__rss_feed_item__category__topic_alias_id',
  }),
})

export function getRetainedRelationConfig(relationTable: string): RetainedRelationConfig {
  if (typeof relationTable !== 'string') throw new Error('Invalid retained relation table')
  if (!Object.hasOwn(retainedRelationConfigs, relationTable)) {
    throw new Error(`Unknown elected relation table: ${relationTable}`)
  }
  return retainedRelationConfigs[relationTable as keyof typeof retainedRelationConfigs]
}
