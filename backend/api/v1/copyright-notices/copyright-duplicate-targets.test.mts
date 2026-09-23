import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'

describe('copyright duplicate targets', () => {
  beforeEach(() => {
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.stubEnv('SES_COPYRIGHT_SOURCE_EMAIL', 'copyright@voucha.ai')
    vi.stubEnv('SES_COPYRIGHT_REPLY_TO', 'copyright@voucha.ai')
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('rejects duplicate hosted placements before persisting a notice', async () => {
    const fixture = await createCopyrightFormFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.claimant)
    const target = fixture.form.targets[0]!
    const response = await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        ...fixture.form,
        targets: [
          target,
          {
            post_id: target.post_id.toUpperCase(),
            image_id: target.image_id.toUpperCase(),
            target_url: `${target.target_url}?duplicate=1`,
          },
        ],
      })
    expect(response.status).toBe(422)
    expect(response.body.message).toBe('targets must be unique')
  })
})
