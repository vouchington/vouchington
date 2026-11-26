import { describe, expect, it } from 'vitest'
import {
  enqueueCopyrightSubmissionGuidance,
  enqueueCopyrightSubmissionGuidances,
} from './copyright-submission-guidance.mts'
import {
  enqueueCopyrightAppealRecommendation,
  enqueueCopyrightAppealRecommendations,
} from './copyright-appeal-recommendation.mts'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, type AIAgentJobName } from '../config.mts'
import { ai_agents } from '../queues.mts'

type RunEnqueue = { submissionId: string; runId: string }

const enqueues: Array<{
  name: Extract<AIAgentJobName, 'copyright-submission-guidance' | 'copyright-appeal-recommendation'>
  prefix: string
  enqueue: (submissionId: string, runId: string) => Promise<void>
  enqueueBulk: (items: readonly RunEnqueue[]) => Promise<void>
}> = [
  {
    name: 'copyright-submission-guidance',
    prefix: 'copyright_submission_guidance_',
    enqueue: enqueueCopyrightSubmissionGuidance,
    enqueueBulk: enqueueCopyrightSubmissionGuidances,
  },
  {
    name: 'copyright-appeal-recommendation',
    prefix: 'copyright_appeal_recommendation_',
    enqueue: enqueueCopyrightAppealRecommendation,
    enqueueBulk: enqueueCopyrightAppealRecommendations,
  },
]

describe.each(enqueues)('$name enqueue', ({ name, prefix, enqueue: enqueueJob, enqueueBulk }) => {
  it('persists an ordered, deduplicated job', async () => {
    const submissionId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const jobId = `${prefix}${runId}`
    try {
      await enqueueJob(submissionId, runId)

      // The in-memory GlideMQ shim records the options the enqueue passed. It does not prove
      // Valkey deduplication or ordering.
      await expect(ai_agents.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name,
        data: { submission_id: submissionId, run_id: runId },
        opts: {
          attempts: AI_AGENTS_DEFAULTS.attempts,
          backoff: AI_AGENTS_DEFAULTS.backoff,
          priority: AGENT_PRIORITY[name],
          removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
          removeOnFail: true,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: { key: `${prefix}${submissionId}`, concurrency: 1 },
        },
      })
    } finally {
      await (await ai_agents.getJob(jobId))?.remove()
    }
  })

  it('adds a page of runs in one call, one job per run id', async () => {
    const items = [0, 1].map(() => ({
      submissionId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
    }))
    const jobIds = items.map(item => `${prefix}${item.runId}`)
    try {
      await enqueueBulk(items)
      const jobs = await Promise.all(jobIds.map(id => ai_agents.getJob(id)))
      expect(jobs.map(job => job?.data)).toEqual(
        items.map(item => ({ submission_id: item.submissionId, run_id: item.runId })),
      )
    } finally {
      await Promise.all(jobIds.map(async id => (await ai_agents.getJob(id))?.remove()))
    }
  })
})
