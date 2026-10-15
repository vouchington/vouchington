import { createQueue } from '@data-stores/valkey-glide-mq'
import { CONTENT_ANALYSIS_QUEUE_NAME } from './config.mts'

export const contentAnalysisQueue = createQueue(CONTENT_ANALYSIS_QUEUE_NAME, {
  priorityKind: 'ranked',
})
