import type { RouteRateLimitEntry } from './types.mts'

/** Copyright intake and staff decisions share the sensitive route tier. */
export const COPYRIGHT_ROUTE_REGISTRY: Record<string, RouteRateLimitEntry> = {
  // Copyright intake — sensitive and scarce; claimant submissions fail closed when the limiter is down
  'POST:/api/v1/copyright-notices': { category: 'sensitive', ttlSeconds: 3600, failClosed: true },
  'POST:/api/v1/copyright-eu-notices': { category: 'sensitive', ttlSeconds: 3600 },
  'POST:/api/v1/copyright-eu-notices/:id/acknowledgment-failures': { category: 'sensitive' },
  'POST:/api/v1/copyright-eu-notices/:id/statements-of-reasons': { category: 'sensitive' },
  'POST:/api/v1/copyright-eu-notices/:id/redress-requests': {
    category: 'sensitive',
    ttlSeconds: 3600,
  },
  'POST:/api/v1/copyright-eu-notices/:id/redress-requests/:redressId/decisions': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements': { category: 'sensitive' },
  'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/outcomes': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/implementations': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-eu-notices/:id/supervised-complaints': { category: 'sensitive' },
  'POST:/api/v1/copyright-eu-reports': { category: 'sensitive' },
  'GET:/api/v1/copyright-eu-reports': { category: 'sensitive' },
  'POST:/api/v1/copyright-uk-notices': { category: 'sensitive', ttlSeconds: 3600 },
  'POST:/api/v1/copyright-uk-notices/:id/acknowledgment-failures': { category: 'sensitive' },
  'POST:/api/v1/copyright-uk-notices/:id/reviews': { category: 'sensitive' },
  'POST:/api/v1/copyright-uk-notices/:id/redress-requests': {
    category: 'sensitive',
    ttlSeconds: 3600,
  },
  'POST:/api/v1/copyright-uk-notices/:id/redress-requests/:redressId/decisions': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-notices/:id/appeals': { category: 'sensitive', ttlSeconds: 3600 },
  'POST:/api/v1/copyright-notices/:id/counter-notices': {
    category: 'sensitive',
    ttlSeconds: 3600,
  },
  'POST:/api/v1/copyright-notices/:id/guest-capabilities': { category: 'sensitive' },
  'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-notices/:id/guest-filings': {
    category: 'sensitive',
    ttlSeconds: 3600,
  },
  'POST:/api/v1/copyright-email-intakes/:id/approvals': { category: 'sensitive' },
  'POST:/api/v1/copyright-email-intakes/:id/rejections': { category: 'sensitive' },
  'POST:/api/v1/copyright-email-intakes/:id/legal-process': { category: 'sensitive' },
  'POST:/api/v1/copyright-email-intakes/:id/correspondence': { category: 'sensitive' },
  'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-form-intakes/:id/reviews': { category: 'sensitive' },
  'POST:/api/v1/copyright-submissions/:id/appeal-reviews': { category: 'sensitive' },
  'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews': { category: 'sensitive' },
  'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-repeat-infringer-incidents/:id/dispositions': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-repeat-infringer-reviews/:id/outcomes': { category: 'sensitive' },
  'POST:/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements': {
    category: 'sensitive',
  },
  'POST:/api/v1/copyright-trusted-flaggers': { category: 'sensitive' },
  'POST:/api/v1/copyright-trusted-flaggers/:id/status-changes': { category: 'sensitive' },
}
