import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { ARTICLE_SYNC_PROCESS_JOB } from '@queues/background/enqueues/article-sync-jobs'
import { processArticleSync } from './processors.mts'

export const articleSyncHandlers = [
  backgroundHandler(ARTICLE_SYNC_PROCESS_JOB, async job => {
    const { userId } = job.data
    if (!userId) throw new Error('Article sync job missing userId')
    return processArticleSync(userId, job.id)
  }),
]
