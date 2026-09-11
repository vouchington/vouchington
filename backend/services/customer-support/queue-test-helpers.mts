import { ai_agents } from '@queues/ai-agents/queues'
import { customer_support } from '@queues/customer-support/queues'

const OBSERVABLE_QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

export async function getSupportMessageEmbeddingJobsFor(threadId: string, messageId: string) {
  const jobs = dedupeJobsById(
    (
      await Promise.all(OBSERVABLE_QUEUE_STATES.map(state => customer_support.getJobs(state)))
    ).flat(),
  )

  return jobs.filter(job => {
    const data = job?.data as { threadId?: string; messageId?: string } | undefined
    return data?.threadId === threadId && data?.messageId === messageId
  })
}

export async function getSupportAgentJobsFor(threadId: string) {
  const jobs = dedupeJobsById(
    (await Promise.all(OBSERVABLE_QUEUE_STATES.map(state => ai_agents.getJobs(state)))).flat(),
  )

  return jobs.filter(job => {
    const data = job?.data as { threadId?: string } | undefined
    return data?.threadId === threadId
  })
}

export function dedupeJobsById<Job extends { id?: unknown }>(jobs: Job[]) {
  const jobsById = new Map<unknown, Job>()
  const jobsWithoutId: Job[] = []

  for (const job of jobs) {
    if (job.id == null) {
      jobsWithoutId.push(job)
      continue
    }

    if (!jobsById.has(job.id)) {
      jobsById.set(job.id, job)
    }
  }

  return [...jobsById.values(), ...jobsWithoutId]
}
