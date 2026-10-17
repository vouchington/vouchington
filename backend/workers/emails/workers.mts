import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import * as templates from './processors/index.mts'
import {
  isLegacyEmailDigestJobName,
  rehomeLegacyEmailDigestJob,
} from '@queues/emails/enqueues/legacy-digest-rehome'
import { parseEmailJob, JobPayloadError } from '@queues/emails/payload/job-payload'
import { QUEUE_NAME } from '@queues/emails/config'
import processEmail from './processors.mts'
import type { Job } from 'glide-mq'
import { processSendCopyrightNoticeEmail } from './processors/copyright-notice.mts'

export const emails = createWorker(QUEUE_NAME, (job: Job) => processEmailJob(job), {
  concurrency: getWorkerConcurrency('emails', { baseline: 5 }),
})

export async function processEmailJob(job: Job): Promise<unknown> {
  if (isLegacyEmailDigestJobName(job.name)) {
    if (typeof job.id !== 'string' || job.id.length === 0) {
      throw new JobPayloadError('legacy digest job is missing an id')
    }
    // Move the payload onto email-digests. This worker does not send it.
    return rehomeLegacyEmailDigestJob({ id: job.id, name: job.name, data: job.data })
  }
  const parsed = parseEmailJob(job.name, job.data)
  switch (parsed.kind) {
    case 'copyright':
      return processSendCopyrightNoticeEmail(parsed.data)
    case 'template':
      return processEmail(templates, parsed.name, parsed.input, parsed.variables)
  }
}
