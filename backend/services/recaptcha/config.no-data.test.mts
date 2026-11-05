import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  overrideUncheckedDynamicConfigFieldsForTest,
} from '../../test-helpers/dynamic-config.mts'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

// getRecaptchaConfig reads the in-memory DynamicConfig field map, so we drive it directly and assert
// the invalid-field branch through the globally mocked `@sentry/node` SDK (via real `onError`)
// without touching Valkey.
const captureException = sentryCaptureExceptionMock

const { getRecaptchaConfig, recaptchaConfig } = await import('./config.mts')

describe('getRecaptchaConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteDynamicConfigFieldsForTest(recaptchaConfig, Object.keys(recaptchaConfig.fieldTypes))
  })

  it('returns defaults when no fields are set', () => {
    expect(getRecaptchaConfig()).toEqual({
      enabled: false,
      blocking_enabled: false,
      block_threshold: 0.5,
    })
  })

  it('applies valid overrides and keeps unset fields at their default', () => {
    overrideDynamicConfigFieldsForTest(recaptchaConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(recaptchaConfig, { block_threshold: 0.3 })
    expect(getRecaptchaConfig()).toEqual({
      enabled: true,
      blocking_enabled: false,
      block_threshold: 0.3,
    })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('keeps the default when a field has the wrong type', () => {
    overrideUncheckedDynamicConfigFieldsForTest(recaptchaConfig, {
      block_threshold: 'not-a-number',
    })
    expect(getRecaptchaConfig().block_threshold).toBe(0.5)
  })
})
