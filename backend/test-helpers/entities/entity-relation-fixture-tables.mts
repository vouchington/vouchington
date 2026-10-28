// Fixture identifiers are fixed independently of the mutable production metadata.
// Canonical parity tests keep both finite family sets aligned with schema generation.
const relationTables = Object.freeze({
  relation__user__save__post: 'relation__user__save__post',
  relation__user__follow__post: 'relation__user__follow__post',
  relation__user__subscribe__post: 'relation__user__subscribe__post',
  relation__user__hide__post: 'relation__user__hide__post',
  relation__user__mentioned__post: 'relation__user__mentioned__post',
  relation__user__category__topic: 'relation__user__category__topic',
  relation__user__follow__topic: 'relation__user__follow__topic',
  relation__user__block__topic: 'relation__user__block__topic',
  relation__user__mute__topic: 'relation__user__mute__topic',
  relation__user__dismiss_recommendation__topic: 'relation__user__dismiss_recommendation__topic',
  relation__user__subscribe_posts__topic: 'relation__user__subscribe_posts__topic',
  relation__user__subscribe_rss_feed_items__topic:
    'relation__user__subscribe_rss_feed_items__topic',
  relation__user__follow__user: 'relation__user__follow__user',
  relation__user__subscribe__user: 'relation__user__subscribe__user',
  relation__user__mute__user: 'relation__user__mute__user',
  relation__user__block__user: 'relation__user__block__user',
  relation__user__dismiss_recommendation__user: 'relation__user__dismiss_recommendation__user',
  relation__user__follow__rss_feed: 'relation__user__follow__rss_feed',
  relation__user__subscribe__rss_feed: 'relation__user__subscribe__rss_feed',
  relation__user__mute__rss_feed: 'relation__user__mute__rss_feed',
  relation__user__save__rss_feed_item: 'relation__user__save__rss_feed_item',
  relation__user__hide__rss_feed_item: 'relation__user__hide__rss_feed_item',
  relation__user__save__url: 'relation__user__save__url',
  relation__user__block__url_hostname: 'relation__user__block__url_hostname',
  relation__user__mute__url_hostname: 'relation__user__mute__url_hostname',
  relation__user__save__community: 'relation__user__save__community',
  relation__user__proxy_follow__community: 'relation__user__proxy_follow__community',
  relation__user__proxy_mute__community: 'relation__user__proxy_mute__community',
  relation__post__category__topic: 'relation__post__category__topic',
  relation__post__mentioned__topic: 'relation__post__mentioned__topic',
  relation__post__category__topic_alias: 'relation__post__category__topic_alias',
  relation__post__related__post: 'relation__post__related__post',
  relation__post__mentioned__post: 'relation__post__mentioned__post',
  relation__post__related__url: 'relation__post__related__url',
  relation__post__mentioned__user: 'relation__post__mentioned__user',
  relation__topic__related__topic: 'relation__topic__related__topic',
  relation__topic__category__topic: 'relation__topic__category__topic',
  relation__topic__publisher_type__topic: 'relation__topic__publisher_type__topic',
  relation__topic__parent__topic: 'relation__topic__parent__topic',
  relation__topic__faq__post: 'relation__topic__faq__post',
  relation__topic__related__post: 'relation__topic__related__post',
  relation__topic__mentioned__post: 'relation__topic__mentioned__post',
  relation__topic__related__url: 'relation__topic__related__url',
  relation__topic__faq__url: 'relation__topic__faq__url',
  relation__topic__guide__url: 'relation__topic__guide__url',
  relation__topic__landing_page__url: 'relation__topic__landing_page__url',
  relation__topic__terms_of_service__url: 'relation__topic__terms_of_service__url',
  relation__rss_feed_item__category__topic: 'relation__rss_feed_item__category__topic',
  relation__rss_feed_item__category__topic_alias: 'relation__rss_feed_item__category__topic_alias',
  relation__community__mute__topic: 'relation__community__mute__topic',
  relation__community__mute__url_hostname: 'relation__community__mute__url_hostname',
  relation__remote_actor__follow__user: 'relation__remote_actor__follow__user',
})

const voteTables = Object.freeze({
  relation__user__category__topic: 'relation__user__category__topic__votes',
  relation__post__category__topic: 'relation__post__category__topic__votes',
  relation__post__category__topic_alias: 'relation__post__category__topic_alias__votes',
  relation__post__related__post: 'relation__post__related__post__votes',
  relation__post__related__url: 'relation__post__related__url__votes',
  relation__topic__related__topic: 'relation__topic__related__topic__votes',
  relation__topic__category__topic: 'relation__topic__category__topic__votes',
  relation__topic__publisher_type__topic: 'relation__topic__publisher_type__topic__votes',
  relation__topic__faq__post: 'relation__topic__faq__post__votes',
  relation__topic__related__post: 'relation__topic__related__post__votes',
  relation__topic__related__url: 'relation__topic__related__url__votes',
  relation__topic__faq__url: 'relation__topic__faq__url__votes',
  relation__topic__guide__url: 'relation__topic__guide__url__votes',
  relation__topic__landing_page__url: 'relation__topic__landing_page__url__votes',
  relation__topic__terms_of_service__url: 'relation__topic__terms_of_service__url__votes',
  relation__rss_feed_item__category__topic: 'relation__rss_feed_item__category__topic__votes',
  relation__rss_feed_item__category__topic_alias:
    'relation__rss_feed_item__category__topic_alias__votes',
})

export function getTestEntityRelationTable(tableName: string): string {
  if (typeof tableName !== 'string') throw new Error('Invalid relation table type')
  if (!Object.hasOwn(relationTables, tableName)) {
    throw new Error(`Invalid relation table name: ${tableName}`)
  }
  return relationTables[tableName as keyof typeof relationTables]
}

export function getTestEntityRelationVoteTable(tableName: string): string {
  if (typeof tableName !== 'string') throw new Error('Invalid election relation type')
  if (!Object.hasOwn(voteTables, tableName)) {
    throw new Error(`Invalid election relation: ${tableName}`)
  }
  return voteTables[tableName as keyof typeof voteTables]
}
