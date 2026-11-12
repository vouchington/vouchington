import { S3Client } from '@aws-sdk/client-s3'

// Resolve the standard AWS task-role chain without the S3 service-specific credential overrides.
// Client construction performs no network call; WIF signs credentials locally for Google STS.
const federationCredentialsClient = new S3Client({ region: process.env.AWS_REGION || 'us-west-2' })
export async function getFederationCredentials(): Promise<{
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}> {
  return federationCredentialsClient.config.credentials()
}
