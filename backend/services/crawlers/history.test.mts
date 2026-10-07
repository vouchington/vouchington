import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import { insertTestReferralProgram } from '@voucha/test-helpers/entities/cards'
import {
  readStaffActionHistory,
  withRejectedStaffActionHistory,
} from '@voucha/test-helpers/staff-action-history'
import { readStaffEditorialRows } from '@voucha/test-helpers/staff-editorial-history'
import { createCrawler } from './create-crawler.mts'
import { updateCrawler } from './update-crawler.mts'
import { deleteCrawler } from './delete.mts'
import { getCrawlerById } from './get.mts'

describe('crawlers staff history', () => {
  it('persists referral program changes under the public field name', async () => {
    const actor = await createTestUser({ administrator: true })
    const hostnameId = await insertTestUrlHostname({
      hostname: `${crypto.randomUUID()}.example.com`,
    })
    const crawler = await createCrawler(actor, { hostname_id: hostnameId, crawler_type: 'fetch' })
    const referralProgramId = await insertTestReferralProgram({ createdById: actor.id })
    expect(
      await updateCrawler(actor, crawler.id, { referral_program_id: referralProgramId }),
    ).toMatchObject({ referral_program_id: referralProgramId })
    expect(await getCrawlerById(crawler.id)).toMatchObject({
      referral_program_id: referralProgramId,
    })
    const rows = await readStaffActionHistory(actor.id)
    expect(rows[1]!.metadata).toMatchObject({
      before: { referral_program_id: null },
      after: { referral_program_id: referralProgramId },
    })
  })
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
        withRejectedStaffActionHistory(async query => {
          if (action === 'create')
            return createCrawler(
              actor,
              { hostname_id: hostnameId, crawler_type: 'fetch' },
              { query },
            )
          if (action === 'update')
            return updateCrawler(actor, crawler!.id, { description: 'Changed' }, { query })
          return deleteCrawler(actor, crawler!.id, { query })
        }),
      ).rejects.toThrow('staff history rejected')
      expect(await readStaffEditorialRows(actor.id)).toEqual(before)
      expect(await readStaffActionHistory(actor.id)).toEqual(history)
    },
  )
})
