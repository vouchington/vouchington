import { SQSClient as CreateSQSClient } from '@aws-sdk/client-sqs'
import createHttpError from 'http-errors'
import { AWS_DUALSTACK_CLIENT_CONFIG, AWS_REGION } from './config.mts'
import { getSqsCredentials, hasSqsCredentials } from './credentials.mts'

let client: CreateSQSClient | undefined

const TEST_SQS_CREDENTIALS = {
  accessKeyId: 'test-sqs-access-key-id',
  secretAccessKey: 'test-sqs-secret-access-key',
}

/* no-mistakes: integration=aws */
export const SQSClient = new Proxy({} as CreateSQSClient, {
  get(_, prop) {
    const target = getSQSClient()
    const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
  },
})

function getSQSClient(): CreateSQSClient {
  if (!client) {
    client = new CreateSQSClient({
      credentials: getSqsClientCredentials(),
      region: AWS_REGION,
      ...AWS_DUALSTACK_CLIENT_CONFIG,
      // QueueUrls are provisioned with the IPv4 sqs.<region>.amazonaws.com host. The SDK defaults
      // useQueueUrlAsEndpoint to true, which overrides the resolved dual-stack endpoint with that
      // host on every call — silently defeating AWS_DUALSTACK_CLIENT_CONFIG and warning twice per
      // call. The JSON protocol carries the QueueUrl in the request body, so the endpoint and the
      // queue identifier are independent: keeping the resolved endpoint loses nothing.
      useQueueUrlAsEndpoint: false,
    })
  }

  return client
}

export function getSqsClientCredentials(env: NodeJS.ProcessEnv = process.env) {
  if (hasSqsCredentials(env)) {
    return getSqsCredentials(env)
  }

  if (isVitestProcess(env)) {
    return TEST_SQS_CREDENTIALS
  }

  // Deployed staging/production uses OpenTofu-managed IAM task roles.
  const environment = env.ENVIRONMENT?.trim()
  if (environment === 'staging' || environment === 'production') {
    return undefined
  }

  throw createMissingSqsCredentialsError(env)
}

function isVitestProcess(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'test' || env.VITEST === 'true'
}

function createMissingSqsCredentialsError(env: NodeJS.ProcessEnv): Error & { status: 503 } {
  const localSetupMessage =
    'SQS credentials are not configured. SQS-backed workers require SQS_AWS_ACCESS_KEY_ID and SQS_AWS_SECRET_ACCESS_KEY in ~/voucha.env, then ./dev/initialize web.'
  const deployedMessage = 'Missing SQS credentials'
  const message = env.NODE_ENV === 'development' ? localSetupMessage : deployedMessage

  return createHttpError(503, message)
}
