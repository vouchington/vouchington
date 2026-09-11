import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '../../test-helpers/dynamic-config.mts'
/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureExceptionMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

const captureException = sentryCaptureExceptionMock

vi.resetModules()

const { DEFAULT_POST_CONTENT_LIMITS, getPostContentLimitsConfig, postContentLimitsConfig } =
  await import('./config.mts')

describe('getPostContentLimitsConfig', () => {
  beforeEach(async () => {
    await postContentLimitsConfig.waitForInitialization()
    vi.clearAllMocks()
    deleteDynamicConfigFieldsForTest(
      postContentLimitsConfig,
      Object.keys(postContentLimitsConfig.fieldTypes),
    )
  })

  it('returns defaults when no fields are set', () => {
    expect(getPostContentLimitsConfig()).toEqual(DEFAULT_POST_CONTENT_LIMITS)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('applies valid overrides and keeps unset fields at their default', () => {
    overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
      data_point_topic_ids_max_items: 7,
    })
    expect(getPostContentLimitsConfig()).toEqual({
      data_point_topic_ids_max_items: 7,
      review_topic_ratings_max_items: 5,
    })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('keeps the default and reports when a defined field is below its minimum', () => {
    overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
      review_topic_ratings_max_items: 1,
    })
    expect(getPostContentLimitsConfig()).toEqual(DEFAULT_POST_CONTENT_LIMITS)
    expect(captureException).toHaveBeenCalledOnce()
  })
})
