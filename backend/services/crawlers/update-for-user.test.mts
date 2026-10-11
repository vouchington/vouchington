import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestCrawler, insertTestUrlHostname } from '@voucha/test-helpers'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import { updateCrawlerForUser } from './update-for-user.mts'

describe('updateCrawlerForUser', () => {
  it('reads the crawler once for an update and a no-op', async () => {
    const admin = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({
      hostname: `crawler-update-query-${crypto.randomUUID()}.example.com`,
    })
    const crawlerId = await insertTestCrawler({ hostnameId, description: 'Before' })

    const changed = await withCapturedTestQueries(() =>
      updateCrawlerForUser(admin, crawlerId, { description: 'After' }),
    )
    expect(changed.result.description).toBe('After')
    expect(countCapturedQueriesByAnnotation(changed.queries, 'getCrawlerById')).toBe(1)

    const unchanged = await withCapturedTestQueries(() =>
      updateCrawlerForUser(admin, crawlerId, {}),
    )
    expect(unchanged.result.description).toBe('After')
    expect(countCapturedQueriesByAnnotation(unchanged.queries, 'getCrawlerById')).toBe(1)
  })

  it('preserves ID and existence errors before update-field validation', async () => {
    const admin = await createTestUser({ administrator: true })
    const invalidUpdates = { hostname_id: 'not-a-hostname-id' }

    await expect(
      updateCrawlerForUser(admin, 'not-a-crawler-id', invalidUpdates),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Invalid crawler ID: not-a-crawler-id',
    })
    await expect(updateCrawlerForUser(admin, '', invalidUpdates)).rejects.toMatchObject({
      status: 422,
      message: 'Invalid crawler ID: ',
    })
    await expect(
      updateCrawlerForUser(admin, '00000000-0000-0000-0000-000000000000', invalidUpdates),
    ).rejects.toMatchObject({ status: 404, message: 'Crawler not found' })
  })
})
