import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '../../test-helpers/dynamic-config.mts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

vi.resetModules()

const { getPostRelatedUrlDisplayConfig, postRelatedUrlDisplayConfig } =
  await import('./post-related-url-display-config.mts')

describe('post related URL display config', () => {
  beforeEach(async () => {
    await postRelatedUrlDisplayConfig.waitForInitialization()
    vi.clearAllMocks()
    deleteDynamicConfigFieldsForTest(postRelatedUrlDisplayConfig, ['summary_limit'])
  })

  it('defaults to ten and accepts bounded runtime overrides', () => {
    expect(getPostRelatedUrlDisplayConfig()).toEqual({ summary_limit: 10 })

    overrideDynamicConfigFieldsForTest(postRelatedUrlDisplayConfig, { summary_limit: 4 })
    expect(getPostRelatedUrlDisplayConfig()).toEqual({ summary_limit: 4 })
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  it.each([0, 11, 1.5])('rejects out-of-range display bound %s', value => {
    overrideDynamicConfigFieldsForTest(postRelatedUrlDisplayConfig, { summary_limit: value })

    expect(getPostRelatedUrlDisplayConfig()).toEqual({ summary_limit: 10 })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
  })
})
