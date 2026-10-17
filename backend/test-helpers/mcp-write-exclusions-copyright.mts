import { exclusions } from './mcp-write-exclusions-builder.mts'

// Copyright notices follow the legal process in docs, not the account tools. The staff routes use
// currentUserCanReviewCopyrightNotices (administrator or moderator) or
// currentUserCanApproveCopyrightJurisdictionPolicy (administrator).
const staff = (routes: string[]) =>
  exclusions(
    'copyright',
    'Copyright process, staff-only (administrator or moderator copyright review guard)',
    routes,
  )

export const copyrightExclusions = [
  ...staff([
    'POST /copyright-email-intakes/:id/legal-process',
    'POST /copyright-eu-notices/:id/acknowledgment-failures',
    'POST /copyright-eu-notices/:id/dispute-settlements',
    'POST /copyright-eu-notices/:id/dispute-settlements/:referralId/implementations',
    'POST /copyright-eu-notices/:id/dispute-settlements/:referralId/outcomes',
    'POST /copyright-eu-notices/:id/redress-requests/:redressId/decisions',
    'POST /copyright-eu-notices/:id/statements-of-reasons',
    'POST /copyright-eu-reports',
    'POST /copyright-uk-notices/:id/acknowledgment-failures',
    'POST /copyright-uk-notices/:id/redress-requests',
    'POST /copyright-uk-notices/:id/redress-requests/:redressId/decisions',
    'POST /copyright-uk-notices/:id/reviews',
    'POST /copyright-notices/:id/guest-capabilities',
    'POST /copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
    'POST /copyright-notices/:id/restrictions/:restrictionId/lifts',
    'POST /copyright-notices/:id/staydown-matches/:matchId/reviews',
    'POST /copyright-media-delivery/replays',
  ]),
  ...exclusions(
    'copyright',
    'Copyright process, administrator-only (jurisdiction policy approval guard)',
    [
      'POST /copyright-jurisdiction-policies',
      'POST /copyright-jurisdiction-policies/:id/withdrawals',
      'POST /copyright-trusted-flaggers',
      'POST /copyright-trusted-flaggers/:id/status-changes',
      'POST /copyright-dsa-statement-submissions/:id/replays',
    ],
  ),
  ...exclusions(
    'copyright',
    'Copyright filing by the rights holder or the affected user, handled by the copyright process',
    [
      'POST /copyright-notices',
      'POST /copyright-notices/:id/appeals',
      'POST /copyright-notices/:id/counter-notices',
      'POST /copyright-notices/:id/guest-filings',
      'POST /copyright-eu-notices',
      'POST /copyright-eu-notices/:id/redress-requests',
      'POST /copyright-eu-notices/:id/supervised-complaints',
      'POST /copyright-uk-notices',
    ],
  ),
  ...exclusions(
    'method-not-allowed',
    'REST answers 405 Method Not Allowed; there is no write to map',
    [
      'PATCH /copyright-trusted-flaggers/:id',
      'DELETE /copyright-trusted-flaggers/:id',
      'DELETE /topics/:idOrSlug',
    ],
  ),
]
