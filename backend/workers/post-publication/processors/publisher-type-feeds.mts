import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import type { PublisherTypeFeedJobData } from '@queues/background/enqueues/post-publication-jobs'
import {
  enqueueBulkPostPublicationEffects,
  enqueuePublisherTypeFeedPublication,
} from '@queues/post-publication/enqueues'
import { listPublisherTypeFeedPublicationPage } from '@services/post-publication/publisher-type-feeds'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'

type PageResult = { affectedPosts: number; rowsRead: number; hasMore: boolean }
type PageJob = Parameters<typeof processPagedDispatcher<PublisherTypeFeedJobData, PageResult>>[0]

/** Native page receipts protect row admissions and successor delivery across retries. */
export async function processPublisherTypeFeedContinuation(job: PageJob): Promise<PageResult> {
  return processPagedDispatcher(job, {
    dispatcher: 'rss',
    cursorKey: 'id',
    target: background,
    targetName: 'background',
    readAndDispatch: async pageSize => {
      const page = await listPublisherTypeFeedPublicationPage(
        job.data.topicIds,
        job.data.afterTopicId,
        pageSize,
      )
      await enqueueBulkPostPublicationEffects(
        page.rssFeedIds.map(rssFeedId => {
          const keys = [{ kind: 'identity_rss_feed' as const, uuidValue: rssFeedId }]
          return {
            changeId: job.data.changeId,
            postId: null,
            scope: { type: 'rss_feed' as const, id: rssFeedId },
            reason: 'rss_feed_discoverability_changed',
            keys,
            keyHash: hashCapturedPublicationKeys(keys),
            chunkIndex: 0,
            scopeStart: true,
            scopeTopicKeysCaptured: false,
            keyOffset: 0,
          }
        }),
      )
      return {
        result: { affectedPosts: 0, rowsRead: page.rowsRead, hasMore: page.hasMore },
        ...(page.hasMore ? { next: { ...job.data, afterTopicId: page.cursor } } : {}),
      }
    },
    enqueueNext: (data, options) => enqueuePublisherTypeFeedPublication(data, options),
  })
}
