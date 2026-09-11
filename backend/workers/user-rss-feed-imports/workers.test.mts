import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { userRssFeedImports } from '@queues/user-rss-feed-imports/queues'
import { userRssFeedImports as userRssFeedImportsWorker } from './workers.mts'

describe('user-rss-feed-imports worker', () => {
  beforeEach(async () => {
    await userRssFeedImports.obliterate({ force: true })
  })

  afterAll(async () => {
    await userRssFeedImportsWorker.close()
  })

  it('rejects when required job data is missing', async () => {
    await expect(
      userRssFeedImports.add('processImportRow', { rowId: 'row-1' } as never, {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
        priority: 10,
      }),
    ).rejects.toThrow('User RSS feed import job .importId is required')

    await expect(
      userRssFeedImports.add('processImportRow', { importId: 'import-1' } as never, {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
        priority: 10,
      }),
    ).rejects.toThrow('User RSS feed import job .rowId is required')
  })

  it('rejects unknown job names', async () => {
    await expect(
      userRssFeedImports.add('unknownJob', { importId: 'import-1', rowId: 'row-1' } as never, {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
        priority: 10,
      }),
    ).rejects.toThrow('Unknown user RSS feed import job: unknownJob')
  })
})
