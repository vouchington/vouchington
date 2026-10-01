/** Operations whose JSON body is a closed object, with the keys the wire contract requires. */
export const CLOSED_BODIES: Readonly<Record<string, readonly string[]>> = {
  'PUT:/api/v1/agent-moderations/:id/vote': ['choice'],
  'PUT:/api/v1/entity-relations/:id/vote': ['choice'],
  'PUT:/api/v1/hostnames/:id/vote': ['choice'],
  'PUT:/api/v1/users/:id/vouch-vote': ['choice'],
  'POST:/api/v1/app-attestation/attest': ['attestation', 'challengeId', 'keyId'],
  'POST:/api/v1/app-attestation/challenge': ['type'],
  'POST:/api/v1/attribution/referrer': ['landing_url', 'referrer'],
  'POST:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType': [],
  'PATCH:/api/v1/hostnames/:id': [],
  'POST:/api/v1/hostnames': ['hostname'],
  'PATCH:/api/v1/households/:id': [],
  'POST:/api/v1/households': [],
  'POST:/api/v1/households/:id/memberships': ['individual_id'],
  'POST:/api/v1/landing-pages/:landingPageId/clicks': ['landing_page_item_id'],
  'POST:/api/v1/landing-pages/:landingPageId/visits': [],
  'PATCH:/api/v1/lists/:id': [],
  'POST:/api/v1/lists': ['name'],
  'POST:/api/v1/lists/:id/import': ['community_slug'],
  'POST:/api/v1/lists/:id/items/posts': ['post_id'],
  'POST:/api/v1/lists/:id/items/rss-feed-items': ['rss_feed_item_id'],
  'POST:/api/v1/markdown/preview': [],
  'PUT:/api/v1/podcast-episodes/:id/playback-position': ['position_seconds'],
  'PATCH:/api/v1/users/:idOrSlug': [],
}

/** Operations with a paginated or filtered query carrier, and the keys it must declare. */
export const QUERY_CARRIERS: Readonly<Record<string, readonly string[]>> = {
  'GET:/api/v1/agent-moderations/:id/votes': ['after', 'limit'],
  'GET:/api/v1/entity-relations/:id/votes': ['after', 'limit'],
  'GET:/api/v1/hostnames/:id/votes': ['after', 'limit'],
  'GET:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType': [
    'after',
    'limit',
    'minNetVoteScore',
    'positiveNetVoteScore',
    'sort',
  ],
  'GET:/api/v1/feeds/posts/:feed_type': ['after', 'community', 'limit', 'sort'],
  'GET:/api/v1/feeds/referral_links/:feed_type': ['after', 'limit'],
  'GET:/api/v1/feeds/rss_feed_items/:feed_type': [
    'after',
    'community',
    'has_related_posts',
    'limit',
    'media_type',
  ],
  'GET:/api/v1/hostnames': ['after', 'blocked', 'crawlable', 'hostname', 'limit'],
  'GET:/api/v1/households': ['access', 'after', 'limit'],
  'GET:/api/v1/households/:id/memberships': ['after', 'limit'],
  'GET:/api/v1/lists': ['after', 'limit'],
  'GET:/api/v1/lists/:id/items': ['after', 'limit', 'media_type', 'read'],
  'GET:/api/v1/urls/:id/crawls': ['after', 'limit'],
  'GET:/api/v1/users': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/communities/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/domains/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/posts/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/rss-feed-items/:listType': ['after', 'limit', 'media_type'],
  'GET:/api/v1/users/:idOrSlug/rss-feeds/:listType': ['after', 'feed_type', 'limit'],
  'GET:/api/v1/users/:idOrSlug/topics/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/urls/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/users/:listType': ['after', 'limit', 'q'],
}

/**
 * Operations recorded as skipped: their only declared carrier is a free-form string path, so a
 * generated contract cannot reject anything the handler does not already resolve to a 404. When
 * one of them gains a body, query or header carrier the ratchet fails, so it is validated in the
 * same change instead of drifting.
 */
export const SKIPPED_OPERATIONS: Readonly<Record<string, string>> = {
  'DELETE:/api/v1/topics/:idOrSlug': 'unconditionally answers 405 and reads nothing',
  'DELETE:/api/v1/users/:idOrSlug': 'free-form id-or-slug path only',
  'GET:/api/v1/users/:idOrSlug': 'free-form id-or-slug path only',
  'GET:/api/v1/users/:id/vouch-context': 'free-form id-or-username path only',
  'GET:/api/v1/users/:idOrSlug/data-request': 'free-form id-or-slug path only',
  'POST:/api/v1/users/:idOrSlug/data-request': 'free-form id-or-slug path only',
  'GET:/api/v1/users/:idOrSlug/data-request/stream':
    'server-sent-event route: no response registration, so no query carrier; request_id is checked in the handler',
  'GET:/api/v1/users/:username/landing-page': 'free-form username path only',
  'GET:/api/v1/users/:username/landing-pages/:slug': 'free-form username and slug path only',
}
