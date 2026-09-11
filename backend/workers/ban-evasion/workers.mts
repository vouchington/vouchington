import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker, type Job } from 'glide-mq'
import { detectBanEvasionForMember } from '@services/communities/ban-evasion'

type BanEvasionJobData = { communityId: string; userId: string; postId?: string }

export async function handleBanEvasionJob(job: Job<BanEvasionJobData>): Promise<unknown> {
  if (!job.data.communityId || !job.data.userId) {
    throw new Error('Ban evasion job requires communityId and userId in job.data')
  }
  await detectBanEvasionForMember(job.data.communityId, job.data.userId, job.data.postId)
  return { success: true }
}

export const banEvasionWorker = new Worker('ban_evasion', handleBanEvasionJob, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('banEvasion', { baseline: 5 }),
  limiter: { max: 5, duration: 1000 },
})
