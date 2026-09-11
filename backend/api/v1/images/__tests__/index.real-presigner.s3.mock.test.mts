import { describe, it, expect, beforeAll, vi } from 'vitest'
import { hasS3Credentials } from '@modules/aws/credentials'

vi.unmock('@aws-sdk/s3-request-presigner')

import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe.skipIf(!hasS3Credentials())('POST /api/v1/images/upload-url', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it(
    'returns a real signed S3 upload URL in test mode',
    { timeout: 30_000 },
    /* no-mistakes: integration=aws */
    async () => {
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
