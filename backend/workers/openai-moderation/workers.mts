import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { OPENAI_MODERATION_JOBS } from '@queues/background/enqueues/openai-moderation-jobs'
import { handleOpenAIModerationOmniSingleJob } from './processors/openai-moderation-omni-single.mts'

export const openAiModerationHandlers = OPENAI_MODERATION_JOBS.map(job =>
  backgroundHandler(job, handleOpenAIModerationOmniSingleJob),
)
