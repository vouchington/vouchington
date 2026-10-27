import { vi } from 'vitest'
import { installS3TestCredentials } from './s3-test-environment.mts'

// The default AWS credential chain dials the EC2 metadata service at 169.254.169.254.
// Unit tests have no instance role. Live provider projects pass explicit credentials.
process.env.AWS_EC2_METADATA_DISABLED ??= 'true'

installS3TestCredentials()

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
