/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { afterAll, afterEach, beforeEach, expect, test } from 'vitest'

type ClientCredentials = {
  accessKeyId: string
  secretAccessKey: string
}

type ReadClientCredentials = (env?: NodeJS.ProcessEnv) => ClientCredentials | undefined

type ClientCredentialEnvCase = {
  envKeys: readonly string[]
  readCredentials: ReadClientCredentials
} & (
  | {
      serviceName: 'S3'
      accessKeyEnv: 'S3_AWS_ACCESS_KEY_ID'
      secretAccessKeyEnv: 'S3_AWS_SECRET_ACCESS_KEY'
      testAccessKeyId: 'test-s3-access-key-id'
      testSecretAccessKey: 'test-s3-secret-access-key'
      configuredAccessKeyId: 'real-s3-key'
      configuredSecretAccessKey: 'real-s3-secret'
    }
  | {
      serviceName: 'SQS'
      accessKeyEnv: 'SQS_AWS_ACCESS_KEY_ID'
      secretAccessKeyEnv: 'SQS_AWS_SECRET_ACCESS_KEY'
      testAccessKeyId: 'test-sqs-access-key-id'
      testSecretAccessKey: 'test-sqs-secret-access-key'
      configuredAccessKeyId: 'real-sqs-key'
      configuredSecretAccessKey: 'real-sqs-secret'
    }
)

/**
 * Shared process.env cleanup and credential cases. Call from a literal `describe`.
 *
 * The client readers re-read process.env on every call. These cases mutate that env against the
 * caller's static import rather than re-importing via vi.resetModules(), which races sibling files
 * that already imported the same module.
 */
export function registerClientCredentialEnvCases(options: ClientCredentialEnvCase): void {
  const {
    envKeys,
    readCredentials,
    serviceName,
    accessKeyEnv,
    secretAccessKeyEnv,
    testAccessKeyId,
    testSecretAccessKey,
    configuredAccessKeyId,
    configuredSecretAccessKey,
  } = options
  const originalEnv = new Map(envKeys.map(key => [key, process.env[key]]))

  beforeEach(() => {
    clearEnv(envKeys)
  })

  afterEach(() => {
    restoreEnv(envKeys, originalEnv)
  })

  afterAll(() => {
    restoreEnv(envKeys, originalEnv)
  })

  test(`uses deterministic credentials for test ${serviceName} clients when no AWS env exists`, () => {
    process.env.NODE_ENV = 'test'

    expect(readCredentials()).toEqual({
      accessKeyId: testAccessKeyId,
      secretAccessKey: testSecretAccessKey,
    })
  })

  test('uses deterministic credentials in Vitest even when NODE_ENV is stubbed', () => {
    process.env.NODE_ENV = 'development'
    process.env.VITEST = 'true'

    expect(readCredentials()).toEqual({
      accessKeyId: testAccessKeyId,
      secretAccessKey: testSecretAccessKey,
    })
  })

  test(`still prefers configured ${serviceName} credentials in test mode`, () => {
    process.env.NODE_ENV = 'test'
    process.env[accessKeyEnv] = configuredAccessKeyId
    process.env[secretAccessKeyEnv] = configuredSecretAccessKey

    expect(readCredentials()).toEqual({
      accessKeyId: configuredAccessKeyId,
      secretAccessKey: configuredSecretAccessKey,
    })
  })

  test(`requires configured ${serviceName} credentials outside test mode`, () => {
    process.env.NODE_ENV = 'development'

    expect(() => readCredentials()).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(`${serviceName} credentials are not configured`),
        status: 503,
      }),
    )
  })

  test('falls back to IAM task role credentials in deployed environments', () => {
    expect(readCredentials({ ENVIRONMENT: 'staging', NODE_ENV: 'production' })).toBeUndefined()
  })
}

function clearEnv(keys: readonly string[]): void {
  for (const key of keys) {
    // oxlint-disable-next-line no-mistakes/no-delete-property, typescript/no-dynamic-delete -- each case starts with these keys unset
    delete process.env[key]
  }
}

function restoreEnv(
  keys: readonly string[],
  originalEnv: ReadonlyMap<string, string | undefined>,
): void {
  for (const key of keys) {
    const value = originalEnv.get(key)
    if (value === undefined) {
      // oxlint-disable-next-line no-mistakes/no-delete-property, typescript/no-dynamic-delete -- snapshot restore drops keys the process did not have
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}
