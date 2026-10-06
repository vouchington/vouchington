import { vi } from 'vitest'
import { BedrockEmbeddingsClient } from '@modules/aws/bedrock-runtime'

// The default AWS credential chain dials the EC2 metadata service at 169.254.169.254.
// Unit tests have no instance role. Live Bedrock stays in the backend-bedrock project.
process.env.AWS_EC2_METADATA_DISABLED ??= 'true'
Object.defineProperty(BedrockEmbeddingsClient, 'send', {
  configurable: true,
  value: () => Promise.reject(new Error('Bedrock is not called from unit tests')),
})

// Provide fallback fake credentials so getS3Credentials() never throws in test
// environments. The vi.mock below normally intercepts getSignedUrl before real
// credentials are ever read, but with pool:'forks' + isolate:false the mock
// hoisting can race with module loading order. The env vars ensure the code
// path that validates credentials still works if the intercept is skipped.
if (!process.env.S3_AWS_ACCESS_KEY_ID && !process.env.AWS_ACCESS_KEY_ID) {
  process.env.S3_AWS_ACCESS_KEY_ID = 'AKIATESTFAKEKEYID000'
  process.env.S3_AWS_SECRET_ACCESS_KEY = 'fakeSecretKeyForTestingPurposesOnly00000'
}

// Mock getSignedUrl to return a fake presigned URL in vitest.
// This avoids needing real AWS credentials for unit/integration tests.
vi.mock<typeof import('@aws-sdk/s3-request-presigner')>(
  import('@aws-sdk/s3-request-presigner'),
  () => ({
    getSignedUrl: vi.fn<VitestLooseMock>((_client, command, options?) => {
      const bucket = command.input.Bucket
      const key = command.input.Key
      const expiresIn = options?.expiresIn || 3600

      return Promise.resolve(
        `https://${bucket}.s3.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test&X-Amz-Expires=${expiresIn}&X-Amz-Signature=fake`,
      )
    }),
  }),
)
