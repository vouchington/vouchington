import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const membershipAdditionalWorkDefaults = {
  pending_verifications_page_size: 50,
  pending_operations_page_size: 50,
  verification_retry_minutes: 5,
  verification_claim_minutes: 30,
  renewal_claim_hours: 1,
  entitlement_effect_batch_size: 100,
  source_recovery_batch_size: 500,
  notification_recovery_batch_size: 500,
  verification_recovery_batch_size: 500,
  google_cursor_page_size: 500,
  apple_history_max_pages: 100,
  microsoft_query_max_pages: 10,
  refund_metadata_pages_per_run: 3,
  stripe_invoice_payment_max_pages: 10,
  stripe_subscription_invoice_max_pages: 10,
  stripe_invoice_line_max_pages: 10,
  stripe_dispute_max_pages: 10,
}

export const membershipAdditionalWorkMaxValues = {
  pending_verifications_page_size: 500,
  pending_operations_page_size: 500,
  verification_retry_minutes: 120,
  verification_claim_minutes: 720,
  renewal_claim_hours: 24,
  entitlement_effect_batch_size: 1000,
  source_recovery_batch_size: 5000,
  notification_recovery_batch_size: 5000,
  verification_recovery_batch_size: 5000,
  google_cursor_page_size: 5000,
  apple_history_max_pages: 1000,
  microsoft_query_max_pages: 100,
  refund_metadata_pages_per_run: 100,
  stripe_invoice_payment_max_pages: 100,
  stripe_subscription_invoice_max_pages: 100,
  stripe_invoice_line_max_pages: 100,
  stripe_dispute_max_pages: 100,
}

export const membershipWorkConfig = new DynamicConfig({
  key: 'memberships-work-config',
  fieldTypes: {
    pending_verifications_page_size: 'number',
    pending_operations_page_size: 'number',
    verification_retry_minutes: 'number',
    verification_claim_minutes: 'number',
    renewal_claim_hours: 'number',
    batch_size: 'number',
    max_batches_per_run: 'number',
    entitlement_effect_batch_size: 'number',
    source_recovery_batch_size: 'number',
    notification_recovery_batch_size: 'number',
    verification_recovery_batch_size: 'number',
    google_cursor_page_size: 'number',
    apple_history_max_pages: 'number',
    microsoft_query_max_pages: 'number',
    refund_metadata_pages_per_run: 'number',
    stripe_invoice_payment_max_pages: 'number',
    stripe_subscription_invoice_max_pages: 'number',
    stripe_invoice_line_max_pages: 'number',
    stripe_dispute_max_pages: 'number',
  },
  defaultFields: { batch_size: 100, max_batches_per_run: 20, ...membershipAdditionalWorkDefaults },
})

export function getMembershipWorkLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(membershipWorkConfig, 'batch_size', {
      defaultValue: 100,
      maxValue: 5000,
    }),
    maxBatches: getBoundedPositiveIntegerField(membershipWorkConfig, 'max_batches_per_run', {
      defaultValue: 20,
      maxValue: 2000,
    }),
  }
}

export function getMembershipWorkLimit(
  field: keyof typeof membershipAdditionalWorkDefaults,
): number {
  return getBoundedPositiveIntegerField(membershipWorkConfig, field, {
    defaultValue: membershipAdditionalWorkDefaults[field],
    maxValue: membershipAdditionalWorkMaxValues[field],
  })
}
