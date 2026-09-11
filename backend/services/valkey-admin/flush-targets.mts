import type { FlushTargetPrefixRegistry, ServiceFlushConcern } from './concerns.mts'

export const CACHE_GROUPS = [
  {
    name: 'users',
    prefixes: ['users_private', 'users_public', 'users_lookup', 'user_metrics'],
  },
  {
    name: 'topics',
    prefixes: [
      'topics',
      'topics_with_redirect',
      'topics_lookup',
      'topic_metrics',
      'topic_elections',
    ],
  },
  {
    name: 'posts',
    prefixes: ['posts', 'posts_lookup', 'post_metrics', 'post_elections'],
  },
  { name: 'rss', prefixes: ['rss_feeds', 'rss_feed_items', 'rss_feed_item_elections'] },
  { name: 'urls', prefixes: ['urls', 'urls_lookup', 'url_hostnames', 'hostname_elections'] },
  {
    name: 'elections',
    prefixes: ['entity_relation_elections', 'agent_moderation_elections'],
  },
] as const

export const CACHE_FLUSH_PREFIXES = CACHE_GROUPS.flatMap(group => [...group.prefixes])

export const SERVICE_FLUSH_TARGET_PREFIXES = {
  caches: CACHE_FLUSH_PREFIXES.map(prefix => `cache:${prefix}:`),
  'recently-viewed': ['recently-viewed:'],
  blooms: ['bloom-filter:', 'bookmark-bloom-ready:'],
  'rate-limiter': ['rate-limiter:'],
  'dynamic-config': ['dynamic-config:'],
  sessions: [
    'voucha:jwt-stale:',
    'voucha:jwt-revoked:',
    'voucha:jwt-user-revoked-before:',
    'passkey-challenge:',
    'mfa-login-attempt:',
    'mfa-reauth:',
    'bluesky-oauth-state:',
    'app-attest-challenge:',
    'app-attest-req-nonce:',
  ],
} satisfies Record<ServiceFlushConcern, readonly string[]>

export function createFlushTargetPrefixRegistry(
  queuePrefixes: readonly string[],
): FlushTargetPrefixRegistry {
  return { ...SERVICE_FLUSH_TARGET_PREFIXES, queues: [...queuePrefixes] }
}
