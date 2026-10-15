import { describe, expect, it } from 'vitest'
import {
  enqueueCopyrightFormScreeningAndWait,
  enqueueOrRetryCopyrightFormScreening,
} from './copyright-form-screening.mts'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import { ai_agents } from '../queues.mts'
import {
  completedCopyrightAgentEnqueueRecovery,
  failedCopyrightAgentEnqueueRecovery,
} from '../../../test-helpers/copyright-agent-enqueue-recovery-tests.mts'

describe('copyright form screening enqueue recovery', () => {
  it('persists an ordered, deduplicated anti-spam screening job', async () => {
    const submissionId = crypto.randomUUID()
    const jobId = `copyright_form_screening_${submissionId}`
    try {
      await enqueueCopyrightFormScreeningAndWait(submissionId)
      // The in-memory GlideMQ shim records the options the enqueue passed. It does not prove
      // Valkey deduplication or ordering. Real coalescing stays in the real-glide file.
      await expect(ai_agents.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'copyright-form-screening',
        data: { submission_id: submissionId },
        opts: {
          attempts: AI_AGENTS_DEFAULTS.attempts,
          backoff: AI_AGENTS_DEFAULTS.backoff,
          priority: AGENT_PRIORITY['copyright-form-screening'],
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

  it('removes a completed job before recovering its missing result', async () => {
    const { remove, enqueue, dependencies } = completedCopyrightAgentEnqueueRecovery(
      'copyright-form-screening',
    )
    await enqueueOrRetryCopyrightFormScreening('submission-id', dependencies)
    expect(remove).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('submission-id')
  })

  it('retries a failed screening job without creating another screening request', async () => {
    const { retry, enqueue, dependencies } = failedCopyrightAgentEnqueueRecovery(
      'copyright-form-screening',
    )
    await enqueueOrRetryCopyrightFormScreening('submission-id', dependencies)
    expect(retry).toHaveBeenCalledOnce()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
