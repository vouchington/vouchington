import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'
import { processPostMentions } from '@services/post-mentions'

export const postMentionsHandlers = [
  backgroundHandler(POST_MENTIONS_PROCESS_JOB, async job => {
    if (!job.data) throw new Error('Post mentions job .data is required')
    await processPostMentions(job.data)
  }),
]
