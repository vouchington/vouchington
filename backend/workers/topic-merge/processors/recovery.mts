import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { TOPIC_MERGE_RECOVER_JOB } from '@queues/background/enqueues/topic-merge-jobs'
import { enqueueTopicMergeRecoveryContinuation } from '@queues/background/enqueues/topic-merge-enqueues'
import { dispatchStalledTopicMergePage } from '@services/topics/merge-recovery'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'

export const topicMergeRecoveryHandler = backgroundHandler(TOPIC_MERGE_RECOVER_JOB, job =>
  processPagedDispatcher(job, {
    dispatcher: 'topicMerges',
    cursorKey: 'id',
    target: background,
    targetName: 'background',
    readAndDispatch: pageSize => dispatchStalledTopicMergePage(job.data, pageSize),
    enqueueNext: enqueueTopicMergeRecoveryContinuation,
  }),
)
