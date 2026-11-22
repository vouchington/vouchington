import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  overrideUncheckedDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import {
  emailAuthLimitsConfig,
  getEmailCodeRequestMinIntervalSeconds,
} from './email-auth-limits-config.mts'

describe('email code request interval config', () => {
  afterEach(() =>
    deleteDynamicConfigFieldsForTest(emailAuthLimitsConfig, ['code_request_min_interval_seconds']),
  )

  it('defaults to one minute', () => {
    deleteDynamicConfigFieldsForTest(emailAuthLimitsConfig, ['code_request_min_interval_seconds'])
    expect(getEmailCodeRequestMinIntervalSeconds()).toBe(60)
  })

  it('honors zero and the upper bound', () => {
    overrideDynamicConfigFieldsForTest(emailAuthLimitsConfig, {
      code_request_min_interval_seconds: 0,
    })
    expect(getEmailCodeRequestMinIntervalSeconds()).toBe(0)
    overrideDynamicConfigFieldsForTest(emailAuthLimitsConfig, {
      code_request_min_interval_seconds: 3600,
    })
    expect(getEmailCodeRequestMinIntervalSeconds()).toBe(3600)
  })

  it.each([-1, 3601, 1.5, '60'])('falls back to the default for invalid stored value %s', value => {
    overrideUncheckedDynamicConfigFieldsForTest(emailAuthLimitsConfig, {
      code_request_min_interval_seconds: value,
    })
    expect(getEmailCodeRequestMinIntervalSeconds()).toBe(60)
  })
})
