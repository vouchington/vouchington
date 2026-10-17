import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import * as templates from './processors/index.mts'
import { parseEmailJob } from '@queues/emails/payload/job-payload'
import { QUEUE_NAME } from '@queues/emails/config'
import processEmail from './processors.mts'
import type { Job } from 'glide-mq'
import { processSendCopyrightNoticeEmail } from './processors/copyright-notice.mts'

export const emails = createWorker(QUEUE_NAME, (job: Job) => processEmailJob(job), {
  concurrency: getWorkerConcurrency('emails', { baseline: 5 }),
})

export async function processEmailJob(job: Job): Promise<unknown> {
  const parsed = parseEmailJob(job.name, job.data)
  switch (parsed.kind) {
    case 'copyright':
      return processSendCopyrightNoticeEmail(parsed.data)
    case 'template':
      return processEmail(templates, parsed.name, parsed.input, parsed.variables)
  }
}
