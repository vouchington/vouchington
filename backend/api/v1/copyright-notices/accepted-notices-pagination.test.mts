import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightAcceptedNoticeCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { createAcceptedCopyrightNotice } from '@voucha/test-helpers/services/copyright-notices/accepted-notice'
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
    // The accepted list is global and the shared database holds other files' notices, so the page
    // starts at this test's own newest notice instead of the list head.
    await createAcceptedCopyrightNotice(await createCopyrightFormFixture())
    const newerOwnedNoticeId = await createAcceptedCopyrightNotice(
      await createCopyrightFormFixture(),
    )
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    const after = await readCopyrightAcceptedNoticeCursorBefore(newerOwnedNoticeId)

    const first = await request
      .get(`/api/v1/copyright-notices?limit=1&after=${encodeURIComponent(after)}`)
      .expect(200)
    expect(first.body.copyright_notices.map((notice: { id: string }) => notice.id)).toEqual([
      newerOwnedNoticeId,
    ])
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
    expect(second.body.copyright_notices).toHaveLength(1)
    expect(second.body.copyright_notices).not.toContainEqual(
      expect.objectContaining({ id: newerOwnedNoticeId }),
    )
    await request.get('/api/v1/copyright-notices?after=not-a-copyright-cursor').expect(400)
  })
})
