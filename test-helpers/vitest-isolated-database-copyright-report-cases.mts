/** Global report deltas require a fresh database; a baseline cannot exclude concurrent suites. */
export const copyrightReportIsolatedCases = {
  'copyright-dsa-notice-empty': {
    file: 'backend/services/copyright-notices/eu-reporting-notices.test.mts',
    fullName:
      'DSA copyright notice aggregates > omits medians when no completed withhold qualifies',
  },
  'copyright-dsa-notice-population': {
    file: 'backend/services/copyright-notices/eu-reporting-notices.test.mts',
    fullName:
      'DSA copyright notice aggregates > counts every pipeline but only in-area flaggers for trusted figures',
  },
  'copyright-dsa-notice-automation': {
    file: 'backend/services/copyright-notices/eu-reporting-notices.test.mts',
    fullName:
      'DSA copyright notice aggregates > counts durable automated assessment provenance rather than nullable staff identity',
  },
  'copyright-dsa-notice-guidance': {
    file: 'backend/services/copyright-notices/eu-reporting-notices.test.mts',
    fullName:
      'DSA copyright notice aggregates > counts guidance-only processing while leaving the human restriction out of automated actions',
  },
  'copyright-dsa-notice-hold': {
    file: 'backend/services/copyright-notices/eu-reporting-notices.test.mts',
    fullName:
      'DSA copyright notice aggregates > includes a court-hold reimposition as a separate law action',
  },
  'copyright-dsa-notice-median': {
    file: 'backend/services/copyright-notices/eu-reporting-notices.test.mts',
    fullName:
      'DSA copyright notice aggregates > rounds receipt-to-completed-withhold time from one notice to two hours decimals',
  },
  'copyright-dsa-complaint-reviewer': {
    file: 'backend/services/copyright-notices/eu-reporting-complaints.test.mts',
    fullName:
      'DSA copyright complaint aggregates > reports reviewer filings from their stored role even before a staff outcome exists',
  },
  'copyright-dsa-complaint-roles': {
    file: 'backend/services/copyright-notices/eu-reporting-complaints.test.mts',
    fullName:
      'DSA copyright complaint aggregates > uses immutable submitter roles and complained-about outcomes across decision periods',
  },
  'copyright-dsa-complaint-trusted': {
    file: 'backend/services/copyright-notices/eu-reporting-complaints.test.mts',
    fullName:
      'DSA copyright complaint aggregates > includes only in-area matches in the trusted no-action subset',
  },
  'copyright-dsa-complaint-periods': {
    file: 'backend/services/copyright-notices/eu-reporting-complaints.test.mts',
    fullName:
      'DSA copyright complaint aggregates > counts a historical complaint only in its receipt period and a later outcome in its decision period',
  },
} as const satisfies Record<string, { file: string; fullName: `${string} > ${string}` }>
