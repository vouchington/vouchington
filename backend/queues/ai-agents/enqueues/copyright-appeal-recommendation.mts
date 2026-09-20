import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'

const jobIdFor = (submissionId: string) => `copyright_appeal_recommendation_${submissionId}`

export async function enqueueCopyrightAppealRecommendationAndWait(
  submissionId: string,
): Promise<void> {
  const opts: JobOptions = {
    ...AI_AGENTS_DEFAULTS,
    jobId: jobIdFor(submissionId),
    priority: AGENT_PRIORITY['copyright-appeal-recommendation'],
    deduplication: { id: `copyright_appeal_recommendation_${submissionId}`, mode: 'simple' },
    ordering: { key: `copyright_appeal_recommendation_${submissionId}`, concurrency: 1 },
  }
  await ai_agents.add('copyright-appeal-recommendation', { submission_id: submissionId }, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'copyright-appeal-recommendation')
}

export async function enqueueOrRetryCopyrightAppealRecommendation(
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
    enqueue: typeof enqueueCopyrightAppealRecommendationAndWait
  } = {
    getJob: (...args) => ai_agents.getJob(...args),
    enqueue: enqueueCopyrightAppealRecommendationAndWait,
  },
): Promise<void> {
  const retained = await dependencies.getJob(jobIdFor(submissionId), { excludeData: true })
  if (retained) {
    if (retained.name !== 'copyright-appeal-recommendation') return
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
