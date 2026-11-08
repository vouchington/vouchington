import { processPublisherTypeFeedContinuation } from './processors/publisher-type-feeds.mts'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  PUBLISHER_TYPE_FEED_PUBLICATION_JOB,
  POST_PUBLICATION_EFFECTS_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { processApplyPostPublicationEffects } from './processors/direct-effects.mts'

/** Hands the job's payload to the processor; the processors take injected dependencies second. */
function delegate<TData>(job: BackgroundJobDefinition<TData>, process: (data: TData) => unknown) {
  return backgroundHandler(job, queued => process(queued.data))
}

export const postPublicationHandlers = [
  backgroundHandler(PUBLISHER_TYPE_FEED_PUBLICATION_JOB, processPublisherTypeFeedContinuation),
  delegate(POST_PUBLICATION_EFFECTS_JOB, processApplyPostPublicationEffects),
]
