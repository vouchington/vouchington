import {
  POST_CONTENT_LIMITS_MAX_VALUES,
  DEFAULT_POST_CONTENT_LIMITS,
  POST_CONTENT_LIMITS_MIN_VALUES,
} from '@services/post-content-limits'
import { BEDROCK_BATCH_MAX_VALUES } from '@services/bedrock-embeddings/batch/config'
import {
  USER_IMPORT_EXPORT_MAX_VALUES,
  USER_IMPORT_EXPORT_MIN_VALUES,
} from '@services/user-import-export/config'
import {
  RSS_FEED_CRAWL_MAX_VALUES,
  RSS_FEED_CRAWL_MIN_VALUES,
} from '@services/rss-feeds/crawl-config'
import { DynamicConfigValidationError } from './namespace.mts'
import type { DynamicConfigFields } from './types.mts'
export function validateRequestSigningModeConfig(next: DynamicConfigFields): void {
  if (['off', 'observe', 'enforce'].includes(next.request_signing_mode as string)) return
  throw new DynamicConfigValidationError('request_signing_mode: must be off|observe|enforce')
}

export function validateVoteWeightConfig(next: DynamicConfigFields): void {
  validatePositiveNumberFields(next)

  const threshold7DaysMs = Number(next.threshold_7_days_ms)
  const threshold30DaysMs = Number(next.threshold_30_days_ms)
  const threshold1YearMs = Number(next.threshold_1_year_ms)
  const threshold2YearsMs = Number(next.threshold_2_years_ms)
  const threshold5YearsMs = Number(next.threshold_5_years_ms)
  if (
    !(
      threshold7DaysMs < threshold30DaysMs &&
      threshold30DaysMs < threshold1YearMs &&
      threshold1YearMs < threshold2YearsMs &&
      threshold2YearsMs < threshold5YearsMs
    )
  ) {
    throw new DynamicConfigValidationError(
      'Age thresholds must be ordered: threshold_7_days_ms < threshold_30_days_ms < threshold_1_year_ms < threshold_2_years_ms < threshold_5_years_ms',
    )
  }
}

export function validatePositiveNumberFields(next: DynamicConfigFields): void {
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) {
      throw new DynamicConfigValidationError(`Field ${key} must be a positive finite number`)
    }
  }
}

export function validatePositiveIntegerFields(next: DynamicConfigFields): void {
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'number' && (!Number.isInteger(value) || value <= 0)) {
      throw new DynamicConfigValidationError(`Field ${key} must be a positive integer`)
    }
  }
}

export function validateRecaptchaConfig(next: DynamicConfigFields): void {
  const blockThreshold = Number(next.block_threshold)
  if (!Number.isFinite(blockThreshold) || blockThreshold < 0 || blockThreshold > 1) {
    throw new DynamicConfigValidationError('Field block_threshold must be a number between 0 and 1')
  }
}

export function validatePostContentLimitsConfig(next: DynamicConfigFields): void {
  for (const key of Object.keys(DEFAULT_POST_CONTENT_LIMITS) as Array<
    keyof typeof DEFAULT_POST_CONTENT_LIMITS
  >) {
    const value = next[key]
    if (
      !Number.isInteger(value) ||
      (value as number) < POST_CONTENT_LIMITS_MIN_VALUES[key] ||
      (value as number) > POST_CONTENT_LIMITS_MAX_VALUES[key]
    ) {
      throw new DynamicConfigValidationError(
        `Field ${key} must be an integer between ${POST_CONTENT_LIMITS_MIN_VALUES[key]} and ${POST_CONTENT_LIMITS_MAX_VALUES[key]}`,
      )
    }
  }
}

export function validateBedrockBatchConfig(next: DynamicConfigFields): void {
  validatePositiveIntegerFields(next)
  for (const [key, maxValue] of Object.entries(BEDROCK_BATCH_MAX_VALUES)) {
    const value = next[key]
    if (typeof value === 'number' && value > maxValue) {
      throw new DynamicConfigValidationError(
        `Field ${key} must be less than or equal to ${maxValue}`,
      )
    }
  }
}

export function validateModerationConfig(next: DynamicConfigFields): void {
  const value = Number(next.ai_generated_confidence_threshold)
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DynamicConfigValidationError(
      'Field ai_generated_confidence_threshold must be a number between 0 and 1',
    )
  }
}

export function validateRssFeedDiscoverabilityConfig(next: DynamicConfigFields): void {
  const makeUndiscoverableMaxNetScore = Number(next.make_undiscoverable_max_net_score)
  const makeDiscoverableAltMinNetScore = Number(next.make_discoverable_alt_min_net_score)
  const makeDiscoverableMinNetScore = Number(next.make_discoverable_min_net_score)
  const makeDiscoverableMinSubscriptions = Number(next.make_discoverable_min_subscriptions)

  if (!Number.isInteger(makeDiscoverableMinSubscriptions) || makeDiscoverableMinSubscriptions < 0) {
    throw new DynamicConfigValidationError(
      'Field make_discoverable_min_subscriptions must be a nonnegative integer',
    )
  }

  if (
    !(
      makeUndiscoverableMaxNetScore < makeDiscoverableAltMinNetScore &&
      makeDiscoverableAltMinNetScore <= makeDiscoverableMinNetScore
    )
  ) {
    throw new DynamicConfigValidationError(
      'RSS feed discoverability thresholds must satisfy make_undiscoverable_max_net_score < make_discoverable_alt_min_net_score <= make_discoverable_min_net_score',
    )
  }
}

export function validateRssFeedCrawlConfig(next: DynamicConfigFields): void {
  const slaFields = [
    'tier1_sla_ms',
    'tier2_sla_ms',
    'tier3_sla_ms',
    'tier4_sla_ms',
    'tier5_sla_ms',
  ] as const
  const numericFields = [...slaFields, 'capacity_budget'] as const

  validatePositiveSafeIntegerFields(
    next,
    numericFields,
    RSS_FEED_CRAWL_MIN_VALUES,
    RSS_FEED_CRAWL_MAX_VALUES,
  )

  const tier1SlaMs = next.tier1_sla_ms as number
  const tier2SlaMs = next.tier2_sla_ms as number
  const tier3SlaMs = next.tier3_sla_ms as number
  const tier4SlaMs = next.tier4_sla_ms as number
  const tier5SlaMs = next.tier5_sla_ms as number

  if (
    !(
      tier1SlaMs < tier2SlaMs &&
      tier2SlaMs < tier3SlaMs &&
      tier3SlaMs < tier4SlaMs &&
      tier4SlaMs < tier5SlaMs
    )
  ) {
    throw new DynamicConfigValidationError(
      'RSS feed crawl SLAs must be ordered: tier1_sla_ms < tier2_sla_ms < tier3_sla_ms < tier4_sla_ms < tier5_sla_ms',
    )
  }
}

export function validateUserImportExportConfig(next: DynamicConfigFields): void {
  const value = next.sync_export_max_items
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < USER_IMPORT_EXPORT_MIN_VALUES.sync_export_max_items ||
    value > USER_IMPORT_EXPORT_MAX_VALUES.sync_export_max_items
  ) {
    throw new DynamicConfigValidationError(
      `Field sync_export_max_items must be an integer between ${USER_IMPORT_EXPORT_MIN_VALUES.sync_export_max_items} and ${USER_IMPORT_EXPORT_MAX_VALUES.sync_export_max_items}`,
    )
  }
}

export function validatePositiveSafeIntegerFields(
  next: DynamicConfigFields,
  fields: readonly string[],
  minValues: Record<string, number>,
  maxValues: Record<string, number>,
): void {
  for (const key of fields) {
    const value = next[key]
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < minValues[key]! ||
      value > maxValues[key]!
    ) {
      throw new DynamicConfigValidationError(
        `Field ${key} must be a safe integer between ${minValues[key]} and ${maxValues[key]}`,
      )
    }
  }
}
