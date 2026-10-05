import type { ScopeAction, ScopeDefinition, ScopeDescriptionKey } from './scope-types.mts'

const USER_RESOURCE_SCOPES = {
  appeals: ['read', 'write'],
  bookmarks: ['read', 'write'],
  cards: ['read', 'write'],
  communities: ['read', 'write'],
  'data-points': ['read'],
  disputes: ['read', 'write'],
  'domain-ratings': ['read'],
  feeds: ['read'],
  'entity-relations': ['read', 'write'],
  'financial-profile': ['read', 'write'],
  hostnames: ['read'],
  lists: ['read', 'write'],
  notifications: ['read', 'write'],
  'point-valuations': ['read', 'write'],
  posts: ['read', 'write'],
  preferences: ['read', 'write'],
  profile: ['read', 'write'],
  recommendations: ['read'],
  'reference-data': ['read'],
  'referral-links': ['read', 'write'],
  reports: ['write'],
  'rss-feeds': ['read'],
  'rss-feed-items': ['read'],
  'rewards-statuses': ['read', 'write'],
  spending: ['read', 'write'],
  'topic-recommendations': ['read', 'write'],
  topics: ['read'],
  users: ['read'],
  'web-search': ['read'],
} as const

const SENSITIVE_DESCRIPTIONS: Record<string, ScopeDescriptionKey> = {
  'financial-profile:read': 'financial_profile_read',
  'financial-profile:write': 'financial_profile_write',
  'spending:read': 'spending_read',
  'spending:write': 'spending_write',
}

export function userResourceDefinitions(): Record<string, ScopeDefinition> {
  return Object.fromEntries(
    Object.entries(USER_RESOURCE_SCOPES).flatMap(([resource, actions]) =>
      actions.map(action => [
        `${resource}:${action}`,
        {
          action: action as ScopeAction,
          audience: 'user',
          ...(action === 'write' && actions.some(candidate => candidate === 'read')
            ? { requires: `${resource}:read` }
            : {}),
          ...(SENSITIVE_DESCRIPTIONS[`${resource}:${action}`]
            ? {
                descriptionKey: SENSITIVE_DESCRIPTIONS[`${resource}:${action}`],
                requiresExactGrant: true,
              }
            : {}),
          resource,
          surfaces: ['api-key', 'oauth'],
        },
      ]),
    ),
  )
}
