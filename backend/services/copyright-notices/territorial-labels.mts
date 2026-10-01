import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

/**
 * Jurisdiction-specific wording for the shared copyright_territorial_* tables.
 *
 * Every territorial query is static SQL that takes the jurisdiction as a value; only the
 * user-visible messages and the encryption purposes differ per jurisdiction. The EU decision is the
 * DSA Art. 17 "statement of reasons"; the UK decision is the staff "review".
 */
export type TerritorialLabels = {
  noticeNotFound: string
  noticeFailed: string
  noticePurpose: string
  decisionPurpose: string
  decisionTextRequired: string
  decisionExists: string
  decisionFailed: string
  decisionNotFound: string
  redressPurpose: string
  redressFailed: string
  redressNotFound: string
  redressDecisionPurpose: string
  redressDecisionExists: string
  redressDecisionFailed: string
}

const TERRITORIAL_LABELS = {
  eu_dsa: {
    noticeNotFound: 'EU copyright notice not found',
    noticeFailed: 'Failed to record EU copyright notice',
    noticePurpose: 'copyright-eu-notice',
    decisionPurpose: 'copyright-eu-statement',
    decisionTextRequired: 'statement is required',
    decisionExists: 'A statement of reasons already exists',
    decisionFailed: 'Failed to record EU statement of reasons',
    decisionNotFound: 'EU statement of reasons not found',
    redressPurpose: 'copyright-eu-redress',
    redressFailed: 'Failed to record EU redress request',
    redressNotFound: 'EU redress request not found',
    redressDecisionPurpose: 'copyright-eu-redress-decision',
    redressDecisionExists: 'EU redress decision already exists',
    redressDecisionFailed: 'Failed to record EU redress decision',
  },
  uk: {
    noticeNotFound: 'UK copyright notice not found',
    noticeFailed: 'Failed to record UK copyright notice',
    noticePurpose: 'copyright-uk-notice',
    decisionPurpose: 'copyright-uk-review',
    decisionTextRequired: 'rationale is required',
    decisionExists: 'A UK copyright review already exists',
    decisionFailed: 'Failed to record UK copyright review',
    decisionNotFound: 'UK copyright review not found',
    redressPurpose: 'copyright-uk-redress',
    redressFailed: 'Failed to record UK redress request',
    redressNotFound: 'UK redress request not found',
    redressDecisionPurpose: 'copyright-uk-redress-decision',
    redressDecisionExists: 'UK redress decision already exists',
    redressDecisionFailed: 'Failed to record UK redress decision',
  },
} as const satisfies Record<TerritorialCopyrightJurisdiction, TerritorialLabels>

export function territorialLabels(
  jurisdiction: TerritorialCopyrightJurisdiction,
): TerritorialLabels {
  return TERRITORIAL_LABELS[jurisdiction]
}
