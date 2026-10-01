import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightFormFixture,
  createNotice,
} from '@services/copyright-notices/route-test-fixtures'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

describe('accepted copyright notice pagination', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('continues accepted cases after a bounded first page without repeats', async () => {
    await createNotice(await createCopyrightFormFixture())
    await createNotice(await createCopyrightFormFixture())
    const request = createRequest()
    await request.authenticateAs(await createTestUser())

    const first = await request.get('/api/v1/copyright-notices?limit=1').expect(200)
    expect(first.body.copyright_notices).toHaveLength(1)
    expect(first.body.page_info).toMatchObject({
      has_next_page: true,
      start_cursor: expect.any(String),
      end_cursor: expect.any(String),
    })
    const second = await request
      .get(
        `/api/v1/copyright-notices?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(second.body.copyright_notices).not.toContainEqual(
      expect.objectContaining({ id: first.body.copyright_notices[0].id }),
    )
    await request.get('/api/v1/copyright-notices?after=not-a-copyright-cursor').expect(400)
  })
})
