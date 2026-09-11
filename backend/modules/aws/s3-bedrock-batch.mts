import { S3Client } from '@aws-sdk/client-s3'
import { AWS_DUALSTACK_CLIENT_CONFIG, BEDROCK_AWS_REGION } from './config.mts'
import { getBedrockCredentials, hasBedrockCredentials } from './credentials.mts'

let bedrockBatchClient: S3Client | undefined

export const S3BedrockBatchBucket = resolveBedrockBatchBucket(process.env)

function resolveBedrockBatchBucket(env: NodeJS.ProcessEnv): string {
  const value = env.S3_BUCKET_BEDROCK_BATCH?.trim()
  if (value) return value
  if (env.VITEST === 'true' || env.NODE_ENV === 'test') return 'test-bedrock-batch'
  throw new Error('Missing S3_BUCKET_BEDROCK_BATCH')
}

/* no-mistakes: integration=aws */
export const S3BedrockBatchClient = new Proxy({} as S3Client, {
  get(targetObject, prop) {
    if (prop in targetObject) {
      return getClientProperty(targetObject, prop)
    }
    const target = getBedrockBatchS3Client()
    return getClientProperty(target, prop)
  },
})

function getClientProperty(target: object, prop: string | symbol): unknown {
  const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
  const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
  return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
}

function getBedrockBatchS3Client(): S3Client {
  if (!bedrockBatchClient) {
    const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
    bedrockBatchClient = new S3Client({
      ...(credentials ? { credentials } : {}),
      region: BEDROCK_AWS_REGION,
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }
  return bedrockBatchClient
}
