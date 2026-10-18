import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  countTopicElectionVoteRowsForUser,
  createTestUser,
  insertTestRssFeedDirect,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createRssFeedImportRowForTest,
  getRssFeedImportRowIds,
  getRssFeedImportSerializationPoolForTest,
  observeRssFeedImportRowLockForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { importSingleRssFeed } from './import-rss-feeds.mts'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'
import { RssFeedImportRowBusyError, withRssFeedImportRowLock } from './rss-feed-import-row-lock.mts'

describe('RSS feed import row serialization', () => {
  it('reports a lost lock connection and reacquires the same row on a fresh session', async () => {
    const rowId = randomUUID()
    const observer = observeRssFeedImportRowLockForTest(rowId)

    try {
      await expect(
        withRssFeedImportRowLock(rowId, async () => {
          await observer.terminateAndWait()
          return 'operation completed'
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/connection|terminated|server|socket/i),
      })
      await expect(withRssFeedImportRowLock(rowId, async () => 'reacquired')).resolves.toBe(
        'reacquired',
      )
    } finally {
      observer.close()
    }
  })

  it('blocks only the claimed row and processes it once released', async () => {
    const user = await createTestUser()
    const submitted = await submitRssFeedImport(user, WEB_PROVENANCE, [
      'not-a-feed-url',
      'also-not-a-feed-url',
    ])
    const [rowId, otherRowId] = await getRssFeedImportRowIds(submitted.import.id)
    if (!rowId || !otherRowId) throw new Error('Expected two RSS import rows')
    const acquired = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holder = withRssFeedImportRowLock(rowId, async () => {
      acquired.resolve()
      await release.promise
    })

    try {
      await acquired.promise
      await expect(processRssFeedImportRow(submitted.import.id, rowId)).rejects.toBeInstanceOf(
        RssFeedImportRowBusyError,
      )
      await processRssFeedImportRow(submitted.import.id, otherRowId)
      const pending = await getRssFeedImport(user.id, submitted.import.id)
      expect(pending?.import).toMatchObject({ completed_rows: 0, failed_rows: 1, pending_rows: 1 })
    } finally {
      release.resolve()
      await holder
    }

    await processRssFeedImportRow(submitted.import.id, rowId)
    const finished = await getRssFeedImport(user.id, submitted.import.id)
    expect(finished?.import).toMatchObject({ completed_rows: 0, failed_rows: 2, pending_rows: 0 })
  })

  it('completes nested automatic votes while serialization clients occupy their pool', async () => {
    const capacity = Math.min(4, getRssFeedImportSerializationPoolForTest().capacity)
    const users = await Promise.all(Array.from({ length: capacity }, () => createTestUser()))
    const rssFeedUrl = `https://serialization-vote-${randomUUID()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl })
    const allAcquired = Promise.withResolvers<void>()
    const proceed = Promise.withResolvers<void>()
    let acquired = 0
    const imports = users.map(async user => {
      const importRowId = await createRssFeedImportRowForTest(user.id, rssFeedUrl)
      return withRssFeedImportRowLock(importRowId, async () => {
        acquired += 1
        if (acquired === capacity) allAcquired.resolve()
        await proceed.promise
        return importSingleRssFeed(user, WEB_PROVENANCE, rssFeedUrl, {
          follow: false,
          importRowId,
        })
      })
    })

    try {
      await allAcquired.promise
      expect(getRssFeedImportSerializationPoolForTest().idle).toBe(0)
      proceed.resolve()
      const results = await Promise.all(imports)
      for (const result of results) {
        expect(result).toMatchObject({ status: 'imported', entity_id: rssFeed.id })
      }
      for (const user of users) {
        expect(await countTopicElectionVoteRowsForUser(user.id)).toBe(1)
      }
    } finally {
      proceed.resolve()
      await Promise.allSettled(imports)
    }
  })
})
