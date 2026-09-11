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

import { recordSqsConsumerConfigMissing } from './sqs-consumer-config-missing.mts'

describe('recordSqsConsumerConfigMissing', () => {
  beforeEach(() => {
    captureMessage.mockClear()
  })

  it('captures a warning-level Sentry message naming the queue and missing env var', () => {
    recordSqsConsumerConfigMissing('bedrock-batch-sqs', 'BEDROCK_BATCH_SQS_QUEUE_URL')

    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('sqs_consumer_config_missing', {
      level: 'warning',
      tags: {
        reason: 'sqs_consumer_config_missing',
        queueName: 'bedrock-batch-sqs',
        missingEnvVar: 'BEDROCK_BATCH_SQS_QUEUE_URL',
      },
    })
  })

  it('emits console.warn in development mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordSqsConsumerConfigMissing('bedrock-batch-sqs', 'BEDROCK_BATCH_SQS_QUEUE_URL')
      expect(consoleWarn).toHaveBeenCalledWith(
        '[sqs-consumer] skipping consumer, missing required config',
        { queueName: 'bedrock-batch-sqs', missingEnvVar: 'BEDROCK_BATCH_SQS_QUEUE_URL' },
      )
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
