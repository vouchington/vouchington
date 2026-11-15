import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'
import { addAIAgentJob } from './create-enqueue.mts'

/** One job per admitted run, so a retained job of an earlier run never shadows a new one. */
const jobIdFor = (runId: string) => `copyright_appeal_recommendation_${runId}`

export async function enqueueCopyrightAppealRecommendation(
  submissionId: string,
  runId: string,
): Promise<void> {
  const opts: JobOptions = {
    ...AI_AGENTS_DEFAULTS,
    jobId: jobIdFor(runId),
    priority: AGENT_PRIORITY['copyright-appeal-recommendation'],
    deduplication: { id: `copyright_appeal_recommendation_${runId}`, mode: 'simple' },
    ordering: { key: `copyright_appeal_recommendation_${submissionId}`, concurrency: 1 },
  }
  await addAIAgentJob(
    'copyright-appeal-recommendation',
    { submission_id: submissionId, run_id: runId },
    opts,
  )
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'copyright-appeal-recommendation')
}

export async function enqueueOrRetryCopyrightAppealRecommendation(
  submissionId: string,
  runId: string,
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
    enqueue: typeof enqueueCopyrightAppealRecommendation
  } = {
    getJob: (...args) => ai_agents.getJob(...args),
    enqueue: enqueueCopyrightAppealRecommendation,
  },
): Promise<void> {
  const retained = await dependencies.getJob(jobIdFor(runId), { excludeData: true })
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
  await dependencies.enqueue(submissionId, runId)
}
