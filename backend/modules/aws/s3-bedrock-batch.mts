import { S3Client } from '@aws-sdk/client-s3'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { AWS_DUALSTACK_CLIENT_CONFIG } from '@vouchington/aws/request-handler'
import { BEDROCK_AWS_REGION, createResponseBodyBoundAwsRequestHandler } from './config.mts'
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
      return getReceiverBoundProperty(targetObject, prop)
    }
    const target = getBedrockBatchS3Client()
    return getReceiverBoundProperty(target, prop)
  },
})

function getBedrockBatchS3Client(): S3Client {
  if (!bedrockBatchClient) {
    const credentials = hasBedrockCredentials() ? getBedrockCredentials() : undefined
    bedrockBatchClient = new S3Client({
      ...(credentials ? { credentials } : {}),
      region: BEDROCK_AWS_REGION,
      requestHandler: createResponseBodyBoundAwsRequestHandler(),
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }
  return bedrockBatchClient
}
