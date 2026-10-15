import { describe, expect, it } from 'vitest'
import { ARTICLE_SYNC_PROCESS_JOB } from '@queues/background/enqueues/article-sync-jobs'
import type { Job } from 'glide-mq'
import { articleSyncHandlers } from './workers.mts'

describe('article-sync workers', () => {
  it('serves the process job', () => {
    expect(articleSyncHandlers.map(handler => handler.job)).toEqual([ARTICLE_SYNC_PROCESS_JOB])
  })

  it('rejects processArticleSync jobs missing a userId', async () => {
    const [handler] = articleSyncHandlers
    await expect(handler!.handle({ id: '1', data: {} } as Job)).rejects.toThrow(
      'Article sync job missing userId',
    )
  })
})
