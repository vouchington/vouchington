import type { TopicMergeProgress } from './merge-operation-types.mts'

export type TopicMergeStagePageResult = {
  progress: TopicMergeProgress
  errorCode?: string
  completed?: boolean
  failed?: boolean
}
