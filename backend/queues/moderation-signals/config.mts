import { MODERATION_SIGNALS_SPAM_DETECTION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'

/** The rank a moderation-signals job takes when the caller names none: the job definition's. */
export const PRIORITY_DEFAULT = MODERATION_SIGNALS_SPAM_DETECTION_JOB.options.priority!
