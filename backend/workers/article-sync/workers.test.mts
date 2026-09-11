import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { articleSync } from '@queues/article-sync/queues'
import { articleSyncWorker } from './workers.mts'

describe('article-sync workers', () => {
  beforeEach(async () => {
    await articleSync.obliterate({ force: true })
  })

  afterAll(async () => {
    await articleSyncWorker.close()
  })

  it('rejects processArticleSync jobs missing a userId', async () => {
    await expect(
      articleSync.add(
        'processArticleSync',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Article sync job missing userId')
  })

  it('rejects unknown job names', async () => {
    await expect(
      articleSync.add(
        'unknownJob',
        { userId: 'user-1' },
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Unknown article sync job: unknownJob')
  })
})
