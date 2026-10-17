import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'

/** The rank a post-mentions job takes when the caller names none: the job definition's priority. */
export const PRIORITY_DEFAULT = POST_MENTIONS_PROCESS_JOB.options.priority!
