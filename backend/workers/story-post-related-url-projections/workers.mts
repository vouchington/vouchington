import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import { processReconcileStoryPostRelatedUrlProjections } from './processors.mts'

export const storyPostRelatedUrlProjectionsHandlers = [
  backgroundHandler(STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB, () =>
    processReconcileStoryPostRelatedUrlProjections(),
  ),
]
