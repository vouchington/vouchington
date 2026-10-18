import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  backgroundCpuQueueConfig,
  backgroundCpuQueueMaxValues,
  getDomainStatsScanCap,
  getPauseCacheMs,
  getPauseRecheckMs,
  getSingleBacklogScanCap,
} from './config.mts'

describe('background CPU work limits', () => {
  let restore: (() => void) | undefined
  beforeAll(async () => {
    await backgroundCpuQueueConfig.waitForInitialization()
    await backgroundCpuQueueConfig.close()
  })
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('uses operator-configured positive bounds for pause and capped queue scans', () => {
    restore = overrideDynamicConfigFieldsForTest(backgroundCpuQueueConfig, {
      pause_recheck_ms: 75,
      pause_cache_ms: 25,
      domain_stats_scan_cap: 7,
      single_backlog_scan_cap: 9,
    })

    expect(getPauseRecheckMs()).toBe(75)
    expect(getPauseCacheMs()).toBe(25)
    expect(getDomainStatsScanCap()).toBe(7)
    expect(getSingleBacklogScanCap()).toBe(9)
  })

  it('rejects unsafe scan and pause overrides instead of disabling their bounds', () => {
    restore = overrideDynamicConfigFieldsForTest(backgroundCpuQueueConfig, {
      pause_recheck_ms: 0,
      domain_stats_scan_cap: backgroundCpuQueueMaxValues.domain_stats_scan_cap + 1,
    })

    expect(getPauseRecheckMs()).toBe(backgroundCpuQueueConfig.defaultFields.pause_recheck_ms)
    expect(getDomainStatsScanCap()).toBe(
      backgroundCpuQueueConfig.defaultFields.domain_stats_scan_cap,
    )
  })
})
