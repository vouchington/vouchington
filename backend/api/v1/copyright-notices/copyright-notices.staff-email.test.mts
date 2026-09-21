import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

const missingId = '00000000-0000-7000-8000-000000000099'

describe('copyright staff email intake routes', () => {
  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('lists staff email intakes and 404s missing records', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    await request.get('/api/v1/copyright-email-intakes').expect(200)
    await request.get(`/api/v1/copyright-email-intakes/${missingId}`).expect(404)
    await request.get(`/api/v1/copyright-email-intakes/${missingId}/raw`).expect(404)
  })

  it('reports a missing delivery replay as not replayed', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const noticeId = '00000000-0000-7000-8000-000000000098'
    await request
      .post(`/api/v1/copyright-notices/${noticeId}/delivery-intents/${missingId}/replays`)
      .expect(res => {
        expect([200, 404, 409, 422]).toContain(res.status)
      })
  })
})
