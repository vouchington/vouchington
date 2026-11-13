import type { CopyrightOperationalScope } from '@services/copyright-notices/operational-retention-cursor'
import {
  sweepCopyrightOperationalRetention,
  sweepUnlinkedCopyrightEmailIntakes,
  sweepCopyrightReceiptReviews,
  sweepCopyrightCaseThreads,
} from '@services/copyright-notices'
import {
  getDataRetentionLimits,
  readDataRetentionField,
  type DataRetentionLimits,
} from './config.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export const COPYRIGHT_RETENTION_FAMILIES = [
  'copyrightFormScreeningAttempts',
  'copyrightActionAttempts',
  'copyrightDeliveryAttempts',
  'copyrightGuestCapabilities',
  'copyrightUnlinkedEmailIntakes',
  'copyrightReceiptReviews',
  'copyrightCaseThreads',
  'copyrightOrphanEmailThreadTokens',
] as const
export type CopyrightRetentionFamily = (typeof COPYRIGHT_RETENTION_FAMILIES)[number]
export type CopyrightRetentionScopes = Partial<
  Record<CopyrightRetentionFamily, CopyrightOperationalScope>
>

type CopyrightRetentionCleanupResult = Partial<
  Pick<DataRetentionCleanupResult, CopyrightRetentionFamily>
>

/** A continuation runs only the copyright families that reached their last page cap. */
export async function runCopyrightOperationalRetentionCleanup(
  options: {
    activeFamilies?: readonly CopyrightRetentionFamily[]
    limits?: DataRetentionLimits
    scopes?: CopyrightRetentionScopes
    now?: Date
  } = {},
): Promise<CopyrightRetentionCleanupResult> {
  const limits = options.limits ?? getDataRetentionLimits()
  const active = (family: CopyrightRetentionFamily) =>
    options.activeFamilies === undefined || options.activeFamilies.includes(family)
  const result: CopyrightRetentionCleanupResult = {}
  if (active('copyrightFormScreeningAttempts'))
    result.copyrightFormScreeningAttempts = await sweepCopyrightOperationalRetention(
      'form_screening_attempts',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_form_screening_attempt_days'),
        scope: options.scopes?.copyrightFormScreeningAttempts,
        now: options.now,
      },
    )
  if (active('copyrightActionAttempts'))
    result.copyrightActionAttempts = await sweepCopyrightOperationalRetention('action_attempts', {
      ...limits,
      retentionDays: readDataRetentionField('copyright_action_attempt_days'),
      scope: options.scopes?.copyrightActionAttempts,
      now: options.now,
    })
  if (active('copyrightDeliveryAttempts'))
    result.copyrightDeliveryAttempts = await sweepCopyrightOperationalRetention(
      'delivery_attempts',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_delivery_attempt_days'),
        scope: options.scopes?.copyrightDeliveryAttempts,
      },
    )
  if (active('copyrightGuestCapabilities'))
    result.copyrightGuestCapabilities = await sweepCopyrightOperationalRetention(
      'guest_capabilities',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_guest_capability_days'),
        scope: options.scopes?.copyrightGuestCapabilities,
      },
    )
  if (active('copyrightUnlinkedEmailIntakes'))
    result.copyrightUnlinkedEmailIntakes = await sweepUnlinkedCopyrightEmailIntakes({
      childLimit: limits.batchSize,
      maxBatches: limits.maxBatches,
      retentionDays: readDataRetentionField('copyright_unlinked_email_intake_days'),
      scope: options.scopes?.copyrightUnlinkedEmailIntakes,
    })
  if (active('copyrightReceiptReviews'))
    result.copyrightReceiptReviews = await sweepCopyrightReceiptReviews({
      ...limits,
      scope: options.scopes?.copyrightReceiptReviews,
    })
  if (active('copyrightCaseThreads'))
    result.copyrightCaseThreads = await sweepCopyrightCaseThreads({
      batchSize: limits.batchSize,
      maxBatches: limits.maxBatches,
      replyDays: readDataRetentionField('copyright_email_thread_reply_days'),
      scope: options.scopes?.copyrightCaseThreads,
      now: options.now,
    })
  if (active('copyrightOrphanEmailThreadTokens'))
    result.copyrightOrphanEmailThreadTokens = await sweepCopyrightOperationalRetention(
      'orphan_email_thread_tokens',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_unlinked_email_intake_days'),
        scope: options.scopes?.copyrightOrphanEmailThreadTokens,
      },
    )
  return result
}
