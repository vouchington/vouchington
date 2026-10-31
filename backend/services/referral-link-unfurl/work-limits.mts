import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const referralUnfurlDispatchConfig = new DynamicConfig({
  key: 'referral-unfurl-dispatch-work-config',
  fieldTypes: { batch_size: 'number', max_rows_per_run: 'number' },
  defaultFields: { batch_size: 1000, max_rows_per_run: 20000 },
})

export type ReferralUnfurlPageLimits = {
  batchSize: number
  maxRows: number
}

const referralUnfurlBatchMax = 5000
const referralUnfurlRowsMax = 100000

function getDispatchLimits(): ReferralUnfurlPageLimits {
  return {
    batchSize: getBoundedPositiveIntegerField(referralUnfurlDispatchConfig, 'batch_size', {
      defaultValue: 1000,
      maxValue: referralUnfurlBatchMax,
    }),
    maxRows: getBoundedPositiveIntegerField(referralUnfurlDispatchConfig, 'max_rows_per_run', {
      defaultValue: 20000,
      maxValue: referralUnfurlRowsMax,
    }),
  }
}

/** Explicit limits win over the shared config, which a Valkey refresh can replace mid-run. */
export function resolveReferralUnfurlPageLimits(
  limits?: ReferralUnfurlPageLimits,
): ReferralUnfurlPageLimits {
  const resolved = limits ?? getDispatchLimits()
  if (
    !Number.isSafeInteger(resolved.batchSize) ||
    resolved.batchSize < 1 ||
    resolved.batchSize > referralUnfurlBatchMax ||
    !Number.isSafeInteger(resolved.maxRows) ||
    resolved.maxRows < 1 ||
    resolved.maxRows > referralUnfurlRowsMax
  )
    throw new RangeError('Referral unfurl page limits must be positive safe integers')
  return { batchSize: resolved.batchSize, maxRows: resolved.maxRows }
}
