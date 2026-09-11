import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTurnstileConfig,
  isTurnstileAlwaysApprove,
  resetTurnstileAlwaysApproveSkipLogForTests,
  turnstileConfig,
} from './config.mts'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  overrideUncheckedDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

describe('turnstile-config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    deleteDynamicConfigFieldsForTest(turnstileConfig, Object.keys(turnstileConfig.fieldTypes))
    resetTurnstileAlwaysApproveSkipLogForTests()
  })

  it('defaults always_approve to false', () => {
    expect(getTurnstileConfig()).toEqual({ always_approve: false })
  })

  it('honors boolean true only on staging', () => {
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: true })
    expect(isTurnstileAlwaysApprove({ ENVIRONMENT: 'staging' })).toBe(true)
    expect(isTurnstileAlwaysApprove({ ENVIRONMENT: 'production' })).toBe(false)
    expect(isTurnstileAlwaysApprove({ ENVIRONMENT: 'development' })).toBe(false)
  })

  it('fails closed for missing, false, and non-boolean values', () => {
    expect(isTurnstileAlwaysApprove({ ENVIRONMENT: 'staging' }, { always_approve: false })).toBe(
      false,
    )
    expect(
      isTurnstileAlwaysApprove(
        { ENVIRONMENT: 'staging' },
        {
          always_approve: 'true' as unknown as boolean,
        },
      ),
    ).toBe(false)
    deleteDynamicConfigFieldsForTest(turnstileConfig, ['always_approve'])
    expect(isTurnstileAlwaysApprove({ ENVIRONMENT: 'staging' })).toBe(false)
  })

  it('treats an invalid stored field as the default and reports it', () => {
    overrideUncheckedDynamicConfigFieldsForTest(turnstileConfig, { always_approve: 'TRUE' })
    expect(getTurnstileConfig()).toEqual({ always_approve: false })
  })
})
