import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { recordSqsConsumerConfigMissing } from './sqs-consumer-config-missing.mts'

describe('recordSqsConsumerConfigMissing', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    captureMessage.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())
  it('reports the disabled consumer and missing configuration without stopping worker startup', () => {
    recordSqsConsumerConfigMissing('ses-inbound-sqs', 'SES_INBOUND_SQS_QUEUE_URL')
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('sqs_consumer_config_missing', {
      level: 'warning',
      tags: {
        reason: 'sqs_consumer_config_missing',
        queueName: 'ses-inbound-sqs',
        missingEnvVar: 'SES_INBOUND_SQS_QUEUE_URL',
      },
    })
  })
})
