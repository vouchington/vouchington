import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker, type Job } from 'glide-mq'
import { processSpamDetection } from './processors.mts'

type SpamDetectionJobData = { id: string; contentSha256?: string }

export async function handleSpamDetectionJob(job: Job<SpamDetectionJobData>): Promise<unknown> {
  if (!job.data.id) throw new Error('Spam detection job requires id in job.data')
  const applied = await processSpamDetection(job.data.id, job.data.contentSha256)
  return { success: true, applied }
}

export const spamDetectionWorker = new Worker('spam_detection', handleSpamDetectionJob, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('spamDetection', { baseline: 5 }),
  limiter: { max: 5, duration: 1000 },
})
