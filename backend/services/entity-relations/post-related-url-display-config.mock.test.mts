import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '../../test-helpers/dynamic-config.mts'
/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Uses the project-level Sentry mock to verify invalid runtime config reporting. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

vi.resetModules()

const {
  DEFAULT_POST_RELATED_URL_DISPLAY_CONFIG,
  getPostRelatedUrlDisplayConfig,
  postRelatedUrlDisplayConfig,
} = await import('./post-related-url-display-config.mts')

describe('post related URL display config', () => {
  beforeEach(async () => {
    await postRelatedUrlDisplayConfig.waitForInitialization()
    vi.clearAllMocks()
    deleteDynamicConfigFieldsForTest(postRelatedUrlDisplayConfig, ['summary_limit'])
  })

  it('defaults to ten and accepts bounded runtime overrides', () => {
    expect(getPostRelatedUrlDisplayConfig()).toEqual(DEFAULT_POST_RELATED_URL_DISPLAY_CONFIG)

    overrideDynamicConfigFieldsForTest(postRelatedUrlDisplayConfig, { summary_limit: 4 })
    expect(getPostRelatedUrlDisplayConfig()).toEqual({ summary_limit: 4 })
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  it.each([0, 11, 1.5])('rejects out-of-range display bound %s', value => {
    overrideDynamicConfigFieldsForTest(postRelatedUrlDisplayConfig, { summary_limit: value })

    expect(getPostRelatedUrlDisplayConfig()).toEqual(DEFAULT_POST_RELATED_URL_DISPLAY_CONFIG)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
  })
})
