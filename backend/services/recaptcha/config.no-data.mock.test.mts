import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  overrideUncheckedDynamicConfigFieldsForTest,
} from '../../test-helpers/dynamic-config.mts'
/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureExceptionMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
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
