type EntityRelationPredicate = {
  description: string
  order_index?: boolean
  election?: boolean
  is_bookmark?: boolean
  bidirectional?: boolean
}

export const entityRelationPredicates: Record<string, EntityRelationPredicate> = {
  rewards_program_status: {
    description: '<object> is a rewards program status of <subject>',
    order_index: true,
  },
  faq: {
    description: '<object> is an FAQ for <subject>',
    election: true,
  },
  category: {
    description: '<subject> is categorized as <object>',
    election: true,
  },
  publisher_type: {
    description: '<subject> is published as <object>',
    election: true,
  },
  related: {
    description: '<subject> is related to <object>',
    election: true,
    bidirectional: true,
  },
  parent: {
    description: '<object> is a parent of <subject>',
  },
  landing_page: {
    description: '<object> is a landing page for <subject>',
    election: true,
  },
  terms_of_service: {
    description: '<object> is a terms of service for <subject>',
    election: true,
  },
  guide: {
    description: '<object> is a guide for <subject>',
    election: true,
  },
  save: {
    description: '<subject> saved <object>',
    is_bookmark: true,
  },
  hide: {
    description: '<subject> hid <object>',
    is_bookmark: true,
  },
  follow: {
    description: '<subject> follows <object>',
    is_bookmark: true,
  },
  mute: {
    description: '<subject> muted <object>',
    is_bookmark: true,
  },
  block: {
    description: '<subject> blocked <object>',
    is_bookmark: true,
  },
  subscribe: {
    description: '<subject> subscribed to <object>',
    is_bookmark: true,
  },
  subscribe_posts: {
    description: '<subject> subscribed to posts for <object>',
    is_bookmark: true,
  },
  subscribe_rss_feed_items: {
    description: '<subject> subscribed to RSS feed items for <object>',
    is_bookmark: true,
  },
  dismiss_recommendation: {
    description: '<subject> dismissed recommendation for <object>',
    is_bookmark: true,
  },
  proxy_follow: {
    description: '<subject> proxy-follows <object>',
    is_bookmark: true,
  },
  proxy_mute: {
    description: '<subject> proxy-mutes <object>',
    is_bookmark: true,
  },
  mentioned: {
    description: '<subject> is mentioned in <object>',
    election: false,
    is_bookmark: false,
  },
}

export type EntityRelationPredicateType = keyof typeof entityRelationPredicates
