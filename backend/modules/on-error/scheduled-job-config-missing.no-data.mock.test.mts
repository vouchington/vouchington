import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mirrors vitest.setup.sentry-mock.mts; kept local so this .mock test owns its vi.mock().
const sentryMocks = vi.hoisted(() => {
  const key = 'vouchaSentryMocks'
  const globalMocks = globalThis as typeof globalThis & {
    [key]?: {
      init: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureException: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureMessage: ReturnType<typeof vi.fn<VitestLooseMock>>
      flush: ReturnType<typeof vi.fn<VitestLooseMock>>
      addBreadcrumb: ReturnType<typeof vi.fn<VitestLooseMock>>
    }
  }
  const mocks = globalMocks[key] ?? {
    init: vi.fn<VitestLooseMock>(),
    captureException: vi.fn<VitestLooseMock>(),
    captureMessage: vi.fn<VitestLooseMock>(),
    flush: vi.fn<VitestLooseMock>(() => Promise.resolve(true)),
    addBreadcrumb: vi.fn<VitestLooseMock>(),
  }
  globalMocks[key] = mocks
  mocks.captureMessage ??= vi.fn<VitestLooseMock>()
  return mocks
})

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  ...sentryMocks,
  default: sentryMocks,
}))

const captureMessage = sentryMocks.captureMessage

import { recordScheduledJobConfigMissing } from './scheduled-job-config-missing.mts'

describe('recordScheduledJobConfigMissing', () => {
  beforeEach(() => {
    captureMessage.mockClear()
  })

  it('captures a warning-level Sentry message naming the job and missing env var', () => {
    recordScheduledJobConfigMissing('reconcile', 'S3_BUCKET_SES_INBOUND')

    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('scheduled_job_config_missing', {
      level: 'warning',
      tags: {
        reason: 'scheduled_job_config_missing',
        jobName: 'reconcile',
        missingEnvVar: 'S3_BUCKET_SES_INBOUND',
      },
    })
  })

  it('emits console.warn in development mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordScheduledJobConfigMissing('reconcile', 'S3_BUCKET_SES_INBOUND')
      expect(consoleWarn).toHaveBeenCalledWith(
        '[scheduled-job] skipping run, missing required config',
        { jobName: 'reconcile', missingEnvVar: 'S3_BUCKET_SES_INBOUND' },
      )
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('does not log to the console in production outside CI, but still reports to Sentry', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordScheduledJobConfigMissing('reconcile', 'S3_BUCKET_SES_INBOUND')
      expect(consoleWarn).not.toHaveBeenCalled()
      expect(captureMessage).toHaveBeenCalledOnce()
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
