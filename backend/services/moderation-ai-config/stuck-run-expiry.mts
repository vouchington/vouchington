import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  stuck_age_hours: 24,
  report_batch_size: 50,
  report_max_batches: 4,
  appeal_batch_size: 50,
  appeal_max_batches: 4,
  dispute_batch_size: 50,
  dispute_max_batches: 4,
  copyright_email_batch_size: 50,
  copyright_email_max_batches: 4,
  copyright_appeal_batch_size: 50,
  copyright_appeal_max_batches: 4,
  copyright_guidance_batch_size: 50,
  copyright_guidance_max_batches: 4,
}

export const stuckResolutionRunExpiryMaxValues = {
  stuck_age_hours: 720,
  report_batch_size: 500,
  report_max_batches: 20,
  appeal_batch_size: 500,
  appeal_max_batches: 20,
  dispute_batch_size: 500,
  dispute_max_batches: 20,
  copyright_email_batch_size: 500,
  copyright_email_max_batches: 20,
  copyright_appeal_batch_size: 500,
  copyright_appeal_max_batches: 20,
  copyright_guidance_batch_size: 500,
  copyright_guidance_max_batches: 20,
}

export const stuckResolutionRunExpiryConfig = new DynamicConfig({
  key: 'stuck-resolution-run-expiry-config',
  fieldTypes: {
    stuck_age_hours: 'number',
    report_batch_size: 'number',
    report_max_batches: 'number',
    appeal_batch_size: 'number',
    appeal_max_batches: 'number',
    dispute_batch_size: 'number',
    dispute_max_batches: 'number',
    copyright_email_batch_size: 'number',
    copyright_email_max_batches: 'number',
    copyright_appeal_batch_size: 'number',
    copyright_appeal_max_batches: 'number',
    copyright_guidance_batch_size: 'number',
    copyright_guidance_max_batches: 'number',
  },
  defaultFields,
})

function readField(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(stuckResolutionRunExpiryConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: stuckResolutionRunExpiryMaxValues[field],
  })
}

export type StuckRunExpiryLimits = { ageHours: number; batchSize: number; maxBatches: number }

/** Each stage has its own page size and run cap, so one backlog never spends the other's budget. */
export function getStuckRunExpiryLimits(
  stage:
    | 'report'
    | 'appeal'
    | 'dispute'
    | 'copyright_email'
    | 'copyright_appeal'
    | 'copyright_guidance',
): StuckRunExpiryLimits {
  return {
    ageHours: readField('stuck_age_hours'),
    batchSize: readField(`${stage}_batch_size`),
    maxBatches: readField(`${stage}_max_batches`),
  }
}
