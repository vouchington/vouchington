import { createTopicMergePageHandler } from './processors/page-handler.mts'
import { topicMergeRecoveryHandler } from './processors/recovery.mts'

export const topicMergeHandlers = [createTopicMergePageHandler(), topicMergeRecoveryHandler]
