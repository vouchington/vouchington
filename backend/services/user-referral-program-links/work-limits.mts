import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const referralLinkCleanupMaxValues = { batch_size: 5_000 }

export const referralLinkCleanupConfig = new DynamicConfig({
  key: 'referral-link-cleanup-work-config',
  fieldTypes: { batch_size: 'number' },
  defaultFields: { batch_size: 1_000 },
})

export function getReferralLinkCleanupBatchSize(): number {
  return getBoundedPositiveIntegerField(referralLinkCleanupConfig, 'batch_size', {
    defaultValue: 1_000,
    maxValue: referralLinkCleanupMaxValues.batch_size,
  })
}
