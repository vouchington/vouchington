import type { ScopeAction, ScopeDefinition } from './scope-types.mts'

const USER_RESOURCE_SCOPES = {
  cards: ['read', 'write'],
  'data-points': ['read'],
  'domain-ratings': ['read'],
  'entity-relations': ['read', 'write'],
  'financial-profile': ['read', 'write'],
  'point-valuations': ['read', 'write'],
  posts: ['read'],
  profile: ['read'],
  recommendations: ['read'],
  'referral-links': ['read'],
  'rewards-statuses': ['read', 'write'],
  spending: ['read', 'write'],
  topics: ['read'],
} as const

export function userResourceDefinitions(): Record<string, ScopeDefinition> {
  return Object.fromEntries(
    Object.entries(USER_RESOURCE_SCOPES).flatMap(([resource, actions]) =>
      actions.map(action => [
        `${resource}:${action}`,
        {
          action: action as ScopeAction,
          audience: 'user',
          ...(action === 'write' ? { requires: `${resource}:read` } : {}),
          resource,
          surfaces: ['api-key', 'oauth'],
        },
      ]),
    ),
  )
}
