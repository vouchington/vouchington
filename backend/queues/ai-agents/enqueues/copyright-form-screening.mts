import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'

const jobIdFor = (submissionId: string) => `copyright_form_screening_${submissionId}`

export async function enqueueCopyrightFormScreeningAndWait(submissionId: string): Promise<void> {
  const opts: JobOptions = {
    ...AI_AGENTS_DEFAULTS,
    jobId: jobIdFor(submissionId),
    priority: AGENT_PRIORITY['copyright-form-screening'],
    deduplication: { id: `copyright_form_screening_${submissionId}`, mode: 'simple' },
    ordering: { key: `copyright_form_screening_${submissionId}`, concurrency: 1 },
  }
  await ai_agents.add('copyright-form-screening', { submission_id: submissionId }, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'copyright-form-screening')
}

export async function enqueueOrRetryCopyrightFormScreening(
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
    enqueue: typeof enqueueCopyrightFormScreeningAndWait
  } = {
    getJob: (...args) => ai_agents.getJob(...args),
    enqueue: enqueueCopyrightFormScreeningAndWait,
  },
): Promise<void> {
  const retained = await dependencies.getJob(jobIdFor(submissionId), { excludeData: true })
  if (retained) {
    if (retained.name !== 'copyright-form-screening') return
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
