/**
 * Shared schema definitions for data point verticals.
 *
 * These definitions are the single source of truth for allowed field values.
 * They are used by:
 *  - Backend services: validation in @services/data-points
 *  - Web frontend: rendering form dropdowns with labels
 *
 * When adding new verticals, results, or allowed values, update this file only.
 */

import { CURRENCIES } from '@ts-shared/money'

export type SelectOption = { value: string; label: string }

// ---------------------------------------------------------------------------
// Verticals
// ---------------------------------------------------------------------------

export type DataPointVertical = 'credit_card' | 'bank_account'

export const DATA_POINT_VERTICALS: SelectOption[] = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'bank_account', label: 'Bank Account' },
]

// ---------------------------------------------------------------------------
// Credit scores
// ---------------------------------------------------------------------------

/** Score ranges on the US FICO 300–850 scale. */
export const CREDIT_SCORE_RANGES: SelectOption[] = [
  { value: '300-579', label: '300–579 (Poor)' },
  { value: '580-669', label: '580–669 (Fair)' },
  { value: '670-739', label: '670–739 (Good)' },
  { value: '740-799', label: '740–799 (Very Good)' },
  { value: '800-850', label: '800–850 (Exceptional)' },
]

/** Sources a credit score may have been pulled from. */
export const CREDIT_SCORE_SOURCES: SelectOption[] = [
  { value: 'credit_karma', label: 'Credit Karma' },
  { value: 'experian', label: 'Experian' },
  { value: 'transunion', label: 'TransUnion' },
  { value: 'equifax', label: 'Equifax' },
  { value: 'fico8', label: 'FICO 8' },
  { value: 'fico9', label: 'FICO 9' },
  { value: 'vantagescore4', label: 'VantageScore 4.0' },
  { value: 'other', label: 'Other' },
]

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

/** Currencies supported for data-point monetary fields. */
export const SUPPORTED_CURRENCIES: SelectOption[] = CURRENCIES.map(currency => ({
  value: currency.code,
  label: currency.code.toUpperCase(),
}))

// ---------------------------------------------------------------------------
// Credit card
// ---------------------------------------------------------------------------

export const CREDIT_CARD_RESULTS: SelectOption[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'pending', label: 'Pending' },
  { value: 'counter_offer', label: 'Counter Offer' },
  { value: 'retention_offer', label: 'Retention Offer' },
  { value: 'sign_up_bonus', label: 'Sign-Up Bonus' },
  { value: 'offer', label: 'Offer' },
]

export const APPLICATION_METHODS: SelectOption[] = [
  { value: 'online', label: 'Online' },
  { value: 'in_branch', label: 'In Branch' },
  { value: 'phone', label: 'Phone' },
  { value: 'pre_approved', label: 'Pre-Approved' },
]

// ---------------------------------------------------------------------------
// Bank account
// ---------------------------------------------------------------------------

export const BANK_ACCOUNT_RESULTS: SelectOption[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'sign_up_bonus', label: 'Sign-Up Bonus' },
  { value: 'offer', label: 'Offer' },
]

export const BANK_ACCOUNT_TYPES: SelectOption[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'cd', label: 'CD (Certificate of Deposit)' },
  { value: 'money_market', label: 'Money Market' },
]
