import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const additionalDefaults = {
  failure_retry_hours: 1,
}
export const crawlerReferralLinksAdditionalMaxValues = {
  failure_retry_hours: 24,
}

export const referralCrawlDispatchConfig = new DynamicConfig({
  key: 'referral-crawl-dispatch-work-config',
  fieldTypes: { batch_size: 'number', max_rows_per_run: 'number', failure_retry_hours: 'number' },
  defaultFields: { batch_size: 1000, max_rows_per_run: 20000, ...additionalDefaults },
})

export type ReferralCrawlPageLimits = {
  batchSize: number
  maxRows: number
}

const referralCrawlBatchMax = 5000
const referralCrawlRowsMax = 100000

function getDispatchLimits(): ReferralCrawlPageLimits {
  return {
    batchSize: getBoundedPositiveIntegerField(referralCrawlDispatchConfig, 'batch_size', {
      defaultValue: 1000,
      maxValue: referralCrawlBatchMax,
    }),
    maxRows: getBoundedPositiveIntegerField(referralCrawlDispatchConfig, 'max_rows_per_run', {
      defaultValue: 20000,
      maxValue: referralCrawlRowsMax,
    }),
  }
}

/** Explicit limits win over the shared config, which a Valkey refresh can replace mid-run. */
export function resolveReferralCrawlPageLimits(
  limits?: ReferralCrawlPageLimits,
): ReferralCrawlPageLimits {
  const resolved = limits ?? getDispatchLimits()
  if (
    !Number.isSafeInteger(resolved.batchSize) ||
    resolved.batchSize < 1 ||
    resolved.batchSize > referralCrawlBatchMax ||
    !Number.isSafeInteger(resolved.maxRows) ||
    resolved.maxRows < 1 ||
    resolved.maxRows > referralCrawlRowsMax
  )
    throw new RangeError('Referral crawl page limits must be positive safe integers')
  return { batchSize: resolved.batchSize, maxRows: resolved.maxRows }
}

export function getCrawlerReferralLinksWorkLimit(field: keyof typeof additionalDefaults): number {
  return getBoundedPositiveIntegerField(referralCrawlDispatchConfig, field, {
    defaultValue: additionalDefaults[field],
    maxValue: crawlerReferralLinksAdditionalMaxValues[field],
  })
}
