import { describe, it, expect, vi } from 'vitest'
import { hasS3Credentials } from '@modules/aws/credentials'

vi.unmock('@aws-sdk/s3-request-presigner')

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

describe('POST /api/v1/images/upload-url', () => {
  it(
    'returns a real signed S3 upload URL in test mode',
    { timeout: 30_000 },
    /* no-mistakes: integration=aws */
    async () => {
      if (!hasS3Credentials()) {
        throw new Error('S3 credentials are required for this credentialed test.')
      }
      const user = await createTestUser()
      let reachedRealPresignerPath = false

      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post('/api/v1/images/upload-url')
        .send({
          content_type: 'image/png',
          content_length: 1024,
        })
        .expect(201)
      reachedRealPresignerPath = true

      const uploadUrl = new URL(response.body.upload.upload_url)

      expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
      expect(uploadUrl.searchParams.get('X-Amz-Credential')).toBeTruthy()
      expect(uploadUrl.searchParams.get('X-Amz-Signature')).toBeTruthy()
      expect(reachedRealPresignerPath).toBe(true)
    },
  )
})
