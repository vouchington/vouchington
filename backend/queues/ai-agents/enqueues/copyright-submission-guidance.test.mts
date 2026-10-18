import { describe, expect, it, vi } from 'vitest'
import {
  enqueueCopyrightSubmissionGuidance,
  enqueueOrRetryCopyrightSubmissionGuidance,
} from './copyright-submission-guidance.mts'
import {
  enqueueCopyrightAppealRecommendation,
  enqueueOrRetryCopyrightAppealRecommendation,
} from './copyright-appeal-recommendation.mts'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, type AIAgentJobName } from '../config.mts'
import { ai_agents } from '../queues.mts'

const enqueues: Array<{
  name: Extract<AIAgentJobName, 'copyright-submission-guidance' | 'copyright-appeal-recommendation'>
  prefix: string
  enqueue: (submissionId: string) => Promise<void>
  recover: typeof enqueueOrRetryCopyrightSubmissionGuidance
}> = [
  {
    name: 'copyright-submission-guidance',
    prefix: 'copyright_submission_guidance_',
    enqueue: enqueueCopyrightSubmissionGuidance,
    recover: enqueueOrRetryCopyrightSubmissionGuidance,
  },
  {
    name: 'copyright-appeal-recommendation',
    prefix: 'copyright_appeal_recommendation_',
    enqueue: enqueueCopyrightAppealRecommendation,
    recover: enqueueOrRetryCopyrightAppealRecommendation,
  },
]

describe.each(enqueues)('$name enqueue recovery', ({ name, prefix, enqueue, recover }) => {
  it('persists an ordered, deduplicated guidance job', async () => {
    const submissionId = crypto.randomUUID()
    const jobId = `${prefix}${submissionId}`
    try {
      await enqueue(submissionId)

        // The in-memory GlideMQ shim records the options the enqueue passed. It does not prove
        // Valkey deduplication or ordering.
        await expect(ai_agents.getJob(jobId)).resolves.toMatchObject({
          id: jobId,
          name,
          data: { submission_id: submissionId },
          opts: {
            attempts: AI_AGENTS_DEFAULTS.attempts,
            backoff: AI_AGENTS_DEFAULTS.backoff,
            priority: AGENT_PRIORITY[name],
            removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
            removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
            deduplication: { id: jobId, mode: 'simple' },
            ordering: { key: jobId, concurrency: 1 },
          },
        })
      } finally {
        await (await ai_agents.getJob(jobId))?.remove()
      }
    })

    it('removes a completed job before recovering its missing advisory result', async () => {
      const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

      await recover('submission-id', {
        getJob: vi
          .fn<
            () => Promise<{
              name: string
              getState(): Promise<string>
              retry(): Promise<void>
              remove(): Promise<void>
            }>
          >()
          .mockResolvedValue({
            name,
            getState: async () => 'completed',
            remove,
            retry: async () => undefined,
          }),
        enqueue,
      })

      expect(remove).toHaveBeenCalledOnce()
      expect(enqueue).toHaveBeenCalledWith('submission-id')
    })

    it('does not replace a retained job owned by another queue route', async () => {
      const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

      await recover('submission-id', {
        getJob: async () => ({
          name: 'another-job',
          getState: async () => 'waiting',
          retry: async () => undefined,
          remove: async () => undefined,
        }),
        enqueue,
      })

      expect(enqueue).not.toHaveBeenCalled()
    })

    it('retries a retained failed advisory job without adding another job', async () => {
      const retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

      await recover('submission-id', {
        getJob: async () => ({
          name,
          getState: async () => 'failed',
          retry,
          remove: async () => undefined,
        }),
        enqueue,
      })

      expect(retry).toHaveBeenCalledOnce()
      expect(enqueue).not.toHaveBeenCalled()
    })
  },
)
