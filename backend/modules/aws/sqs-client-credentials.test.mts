import { describe } from 'vitest'
import { registerClientCredentialEnvCases } from './client-credential-env-cases.mts'
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

describe('getSqsClientCredentials', () => {
  registerClientCredentialEnvCases({
    envKeys: ENV_KEYS,
    readCredentials: getSqsClientCredentials,
    serviceName: 'SQS',
    accessKeyEnv: 'SQS_AWS_ACCESS_KEY_ID',
    secretAccessKeyEnv: 'SQS_AWS_SECRET_ACCESS_KEY',
    testAccessKeyId: 'test-sqs-access-key-id',
    testSecretAccessKey: 'test-sqs-secret-access-key',
    configuredAccessKeyId: 'real-sqs-key',
    configuredSecretAccessKey: 'real-sqs-secret',
  })
})
