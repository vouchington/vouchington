import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'

const jobIdFor = (submissionId: string) => `copyright_submission_guidance_${submissionId}`

export async function enqueueCopyrightSubmissionGuidanceAndWait(
  submissionId: string,
): Promise<void> {
  const opts: JobOptions = {
    ...AI_AGENTS_DEFAULTS,
    jobId: jobIdFor(submissionId),
    priority: AGENT_PRIORITY['copyright-submission-guidance'],
    deduplication: { id: `copyright_submission_guidance_${submissionId}`, mode: 'simple' },
    ordering: { key: `copyright_submission_guidance_${submissionId}`, concurrency: 1 },
  }
  await ai_agents.add('copyright-submission-guidance', { submission_id: submissionId }, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'copyright-submission-guidance')
}

export async function enqueueOrRetryCopyrightSubmissionGuidance(
  submissionId: string,
  dependencies: {
    getJob(
      id: string,
      options: { excludeData: true },
    ): Promise<{
      name: string
      getState(): Promise<string>
      retry(): Promise<void>
      remove(): Promise<void>
    } | null>
    enqueue: typeof enqueueCopyrightSubmissionGuidanceAndWait
  } = {
    getJob: (...args) => ai_agents.getJob(...args),
    enqueue: enqueueCopyrightSubmissionGuidanceAndWait,
  },
): Promise<void> {
  const retained = await dependencies.getJob(jobIdFor(submissionId), { excludeData: true })
  if (retained) {
    if (retained.name !== 'copyright-submission-guidance') return
    const state = await retained.getState()
    if (state === 'failed') {
      await retained.retry()
      return
    }
    if (state === 'completed') await retained.remove()
    else return
  }
  await dependencies.enqueue(submissionId)
}
