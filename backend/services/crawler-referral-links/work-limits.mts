import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

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

export function getDispatchLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(referralCrawlDispatchConfig, 'batch_size', {
      defaultValue: 1000,
      maxValue: 5000,
    }),
    maxRows: getBoundedPositiveIntegerField(referralCrawlDispatchConfig, 'max_rows_per_run', {
      defaultValue: 20000,
      maxValue: 100000,
    }),
  }
}

export function getCrawlerReferralLinksWorkLimit(field: keyof typeof additionalDefaults): number {
  return getBoundedPositiveIntegerField(referralCrawlDispatchConfig, field, {
    defaultValue: additionalDefaults[field],
    maxValue: crawlerReferralLinksAdditionalMaxValues[field],
  })
}
