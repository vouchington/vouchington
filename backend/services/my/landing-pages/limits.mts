import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import { createCodedError } from '@vouchington/sentry'
import { LANDING_PAGE_ITEM_LIMIT_REACHED } from '@modules/on-error/error-codes'
import type { LandingPageItemInput } from './types.mts'

export const LANDING_PAGE_LIMIT_MAX_VALUES = {
  items_per_page: 1000,
  pages_per_user: 20,
  transaction_attempts: 5,
}
export const landingPageLimitsConfig = new DynamicConfig({
  key: 'landing-page-limits-config',
  fieldTypes: {
    items_per_page: 'number',
    pages_per_user: 'number',
    transaction_attempts: 'number',
  },
  defaultFields: { items_per_page: 100, pages_per_user: 20, transaction_attempts: 3 },
})

export function getLandingPagesPerUserLimit(): number {
  return getBoundedPositiveIntegerField(landingPageLimitsConfig, 'pages_per_user', {
    defaultValue: 20,
    maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.pages_per_user,
  })
}

export function getLandingPageItemLimit(): number {
  return getBoundedPositiveIntegerField(landingPageLimitsConfig, 'items_per_page', {
    defaultValue: 100,
    maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.items_per_page,
  })
}

export function getLandingPageTransactionAttempts(): number {
  return getBoundedPositiveIntegerField(landingPageLimitsConfig, 'transaction_attempts', {
    defaultValue: 3,
    maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.transaction_attempts,
  })
}

export function assertLandingPageItemLimit(items: LandingPageItemInput[]): void {
  const limit = getLandingPageItemLimit()
  let count = 0
  for (const item of items) {
    count += 1 + (item.type === 'topic_group' ? item.entries.length : 0)
    if (count > limit) {
      throw createCodedError(
        409,
        'Landing page item limit reached',
        LANDING_PAGE_ITEM_LIMIT_REACHED,
      )
    }
  }
}
