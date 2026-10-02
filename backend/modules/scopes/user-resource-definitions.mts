import type { ScopeAction, ScopeDefinition, ScopeDescriptionKey } from './scope-types.mts'

const USER_RESOURCE_SCOPES = {
  bookmarks: ['read', 'write'],
  cards: ['read', 'write'],
  communities: ['read'],
  'data-points': ['read'],
  'domain-ratings': ['read'],
  'entity-relations': ['read', 'write'],
  'financial-profile': ['read', 'write'],
  lists: ['read', 'write'],
  'point-valuations': ['read', 'write'],
  posts: ['read'],
  profile: ['read'],
  recommendations: ['read'],
  'referral-links': ['read', 'write'],
  'rewards-statuses': ['read', 'write'],
  spending: ['read', 'write'],
  'topic-recommendations': ['read', 'write'],
  topics: ['read'],
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
          ...(action === 'write' ? { requires: `${resource}:read` } : {}),
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
