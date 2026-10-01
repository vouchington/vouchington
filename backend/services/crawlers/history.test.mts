import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  withRejectedStaffActionHistory,
} from '@voucha/test-helpers/staff-action-history'
import { readStaffEditorialRows } from '@voucha/test-helpers/staff-editorial-history'
import { createCrawler } from './create-crawler.mts'
import { updateCrawler } from './update-crawler.mts'
import { deleteCrawler } from './delete.mts'

describe('crawlers staff history', () => {
  it('records crawler creation, changed fields and deletion', async () => {
    const actor = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({
      hostname: `${crypto.randomUUID()}.example.com`,
    })
    const crawler = await createCrawler(actor, {
      hostname_id: hostnameId,
      crawler_type: 'fetch',
      description: 'Before',
    })
    await updateCrawler(actor, crawler.id, { description: 'After' })
    await deleteCrawler(actor, crawler.id)
    const rows = await readStaffActionHistory(actor.id)
    expect(rows.map(row => row.action_type)).toEqual([
      'crawler_create',
      'crawler_update',
      'crawler_delete',
    ])
    expect(rows[1]!.metadata).toMatchObject({
      before: { description: 'Before' },
      after: { description: 'After' },
    })
    expect(rows[2]!.metadata).toMatchObject({
      before: { description: 'After' },
      after: { deleted: true },
    })
  })

  it.each(['create', 'update', 'delete'] as const)(
    'rolls back crawler %s when history fails',
    async action => {
      const actor = await createTestUser({ administrator: true })
      const hostnameId = await insertTestUrlHostname({
        hostname: `${crypto.randomUUID()}.example.com`,
      })
      const crawler =
        action === 'create'
          ? null
          : await createCrawler(actor, { hostname_id: hostnameId, crawler_type: 'fetch' })
      const before = await readStaffEditorialRows(actor.id)
      const history = await readStaffActionHistory(actor.id)
      await expect(
        withRejectedStaffActionHistory(actor.id, async () => {
          if (action === 'create')
            return createCrawler(actor, { hostname_id: hostnameId, crawler_type: 'fetch' })
          if (action === 'update')
            return updateCrawler(actor, crawler!.id, { description: 'Changed' })
          return deleteCrawler(actor, crawler!.id)
        }),
      ).rejects.toThrow('staff history rejected')
      expect(await readStaffEditorialRows(actor.id)).toEqual(before)
      expect(await readStaffActionHistory(actor.id)).toEqual(history)
    },
  )
})
