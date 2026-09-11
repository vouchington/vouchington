import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSqsClientCredentials } from './sqs.mts'

const ENV_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'SQS_AWS_ACCESS_KEY_ID',
  'SQS_AWS_SECRET_ACCESS_KEY',
  'SQS_AWS_SESSION_TOKEN',
  'NODE_ENV',
  'VITEST',
] as const

const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>

// getSqsClientCredentials() re-reads process.env on every call (no module-load-time state), so
// these tests mutate process.env directly against the static import above rather than
// re-importing via vi.resetModules() — a dynamic re-import here would race sibling test files'
// static `import ... from './sqs.mts'`. Mirrors s3-client-credentials.test.mts.
describe('getSqsClientCredentials', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    restoreEnv()
  })

  afterAll(() => {
    restoreEnv()
  })

  it('uses deterministic credentials for test SQS clients when no AWS env exists', () => {
    process.env.NODE_ENV = 'test'

    expect(getSqsClientCredentials()).toEqual({
      accessKeyId: 'test-sqs-access-key-id',
      secretAccessKey: 'test-sqs-secret-access-key',
    })
  })

  it('uses deterministic credentials in Vitest even when NODE_ENV is stubbed', () => {
    process.env.NODE_ENV = 'development'
    process.env.VITEST = 'true'

    expect(getSqsClientCredentials()).toEqual({
      accessKeyId: 'test-sqs-access-key-id',
      secretAccessKey: 'test-sqs-secret-access-key',
    })
  })

  it('still prefers configured SQS credentials in test mode', () => {
    process.env.NODE_ENV = 'test'
    process.env.SQS_AWS_ACCESS_KEY_ID = 'real-sqs-key'
    process.env.SQS_AWS_SECRET_ACCESS_KEY = 'real-sqs-secret'

    expect(getSqsClientCredentials()).toEqual({
      accessKeyId: 'real-sqs-key',
      secretAccessKey: 'real-sqs-secret',
    })
  })

  it('requires configured SQS credentials outside test mode', () => {
    process.env.NODE_ENV = 'development'

    const error = getThrownError(() => getSqsClientCredentials())
    expect(error).toMatchObject({
      message: expect.stringContaining('SQS credentials are not configured'),
      status: 503,
    })
  })

  it('falls back to IAM task role credentials in deployed environments', () => {
    expect(
      getSqsClientCredentials({ ENVIRONMENT: 'staging', NODE_ENV: 'production' }),
    ).toBeUndefined()
  })
})

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function getThrownError(fn: () => unknown): Error {
  try {
    fn()
  } catch (error) {
    if (error instanceof Error) return error
  }

  throw new Error('Expected function to throw')
}
