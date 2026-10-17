import type { Job } from 'glide-mq'

export function isFinalActivityPubInboxAttempt(job: Pick<Job, 'attemptsMade' | 'opts'>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
}
