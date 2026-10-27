import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { TOPIC_MERGE_PAGE_JOB } from '@queues/background/enqueues/topic-merge-jobs'
import { enqueueTopicMergePage } from '@queues/background/enqueues/topic-merge-enqueues'
import { processTopicMergeOperationPage } from '@services/topics/merge-operation-page'

export function createTopicMergePageHandler(
  enqueuePage: (
    operationId: string,
    generation: number,
  ) => Promise<unknown> = enqueueTopicMergePage,
) {
  return backgroundHandler(TOPIC_MERGE_PAGE_JOB, async job => {
    const { operationId, generation } = job.data
    const next = await processTopicMergeOperationPage(operationId, generation)
    if (next !== null) await enqueuePage(operationId, next)
  })
}
