import { S3Client } from '@aws-sdk/client-s3'
import type { S3BucketConfig } from '../config.mts'

// Cache S3 clients to reuse connections across Lambda invocations
const clientCache = new Map<string, S3Client>()

function getCacheKey(config: S3BucketConfig): string {
  return `${config.bucket}:${config.region}`
}

export function createS3Client(config: S3BucketConfig): S3Client {
  const cacheKey = getCacheKey(config)

  let client = clientCache.get(cacheKey)
  if (!client) {
    // Do NOT pass explicit credentials here. On Lambda the SDK's default
    // credential chain automatically picks up the execution role's temporary
    // credentials (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_SESSION_TOKEN).
    // Hardcoding credentials from env vars at module-load time captures a static
    // snapshot that lacks the session token, causing "AccessKeyId does not exist"
    // errors when Lambda's temporary credentials rotate.
    //
    // In local dev, set the standard AWS_* env vars or use ~/.aws/credentials —
    // the SDK default chain handles both.
    client = new S3Client({ region: config.region })
    clientCache.set(cacheKey, client)
  }

  return client
}
