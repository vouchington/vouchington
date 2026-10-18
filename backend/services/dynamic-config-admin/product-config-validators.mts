import {
  DynamicConfigValidationError,
  validatePositiveNumberFields,
} from 'valkyries/dynamic-config'
import type { DynamicConfigFields } from '@vouchington/dynamic-config'

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

export function validateRssFeedDiscoverabilityConfig(next: DynamicConfigFields): void {
  const makeUndiscoverableMaxNetScore = Number(next.make_undiscoverable_max_net_score)
  const makeDiscoverableAltMinNetScore = Number(next.make_discoverable_alt_min_net_score)
  const makeDiscoverableMinNetScore = Number(next.make_discoverable_min_net_score)
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
