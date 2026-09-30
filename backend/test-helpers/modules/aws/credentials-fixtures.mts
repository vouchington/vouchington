import { afterEach, beforeEach, vi } from 'vitest'

const ENV_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'S3_AWS_ACCESS_KEY_ID',
  'S3_AWS_SECRET_ACCESS_KEY',
  'S3_AWS_SESSION_TOKEN',
  'BEDROCK_AWS_ACCESS_KEY_ID',
  'BEDROCK_AWS_SECRET_ACCESS_KEY',
  'BEDROCK_AWS_SESSION_TOKEN',
  'FIREHOSE_AWS_ACCESS_KEY_ID',
  'FIREHOSE_AWS_SECRET_ACCESS_KEY',
  'FIREHOSE_AWS_SESSION_TOKEN',
  'SES_AWS_ACCESS_KEY_ID',
  'SES_AWS_SECRET_ACCESS_KEY',
  'SES_AWS_SESSION_TOKEN',
  'SQS_AWS_ACCESS_KEY_ID',
  'SQS_AWS_SECRET_ACCESS_KEY',
  'SQS_AWS_SESSION_TOKEN',
] as const

export type CredentialEnvKey = (typeof ENV_KEYS)[number]

export function setupCredentialEnv() {
  beforeEach(() => {
    for (const key of ENV_KEYS) vi.stubEnv(key, undefined)
  })

  afterEach(() => vi.unstubAllEnvs())

  function setEnv(key: CredentialEnvKey, value: string | undefined) {
    vi.stubEnv(key, value)
  }

  return { setEnv }
}
