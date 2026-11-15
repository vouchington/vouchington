import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  getReportingCleanupRows,
  getReportingDaysPerJob,
  reportingRollupWorkConfig,
} from './work-limits.mts'

describe('reporting work budgets', () => {
  it('uses configured positive budgets and rejects oversized budgets in favor of the defaults', () => {
    const restore = overrideDynamicConfigFieldsForTest(reportingRollupWorkConfig, {
      days_per_job: 2,
      cleanup_rows: 3,
    })
    try {
      expect(getReportingDaysPerJob()).toBe(2)
      expect(getReportingCleanupRows()).toBe(3)
    } finally {
      restore()
    }
    const restoreOversized = overrideDynamicConfigFieldsForTest(reportingRollupWorkConfig, {
      days_per_job: 8,
      cleanup_rows: 10001,
    })
    try {
      expect(getReportingDaysPerJob()).toBe(1)
      expect(getReportingCleanupRows()).toBe(1000)
    } finally {
      restoreOversized()
    }
  })
})
