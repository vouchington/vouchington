import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('copyright form filer disclosure', () => {
  useCopyrightIntakeEnvironment()
  afterEach(() => vi.restoreAllMocks())

  it('rejects a guest disclosure when the request is signed in', async () => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    const fixture = await createCopyrightFormFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.claimant)
    const key = crypto.randomUUID()

    await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', key)
      .set('X-Voucha-Expected-Filer', 'guest')
      .send(fixture.form)
      .expect(409)
    const created = await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', key)
      .set('X-Voucha-Expected-Filer', `user:${fixture.claimant.id}`)
      .send(fixture.form)
      .expect(202)
    expect(created.body.copyright_notice.id).toEqual(expect.any(String))
  })
})
