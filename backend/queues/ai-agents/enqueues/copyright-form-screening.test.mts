import { describe, expect, it } from 'vitest'
import {
  enqueueCopyrightFormScreeningAndWait,
  enqueueOrRetryCopyrightFormScreening,
} from './copyright-form-screening.mts'
import { ai_agents } from '../queues.mts'
import {
  completedCopyrightAgentEnqueueRecovery,
  failedCopyrightAgentEnqueueRecovery,
  restoreCopyrightAgentEnqueueSpies,
  spyOnCopyrightAgentEnqueue,
} from '../../../test-helpers/copyright-agent-enqueue-recovery-tests.mts'

describe('copyright form screening enqueue recovery', () => {
  restoreCopyrightAgentEnqueueSpies()

  it('creates an ordered, deduplicated anti-spam screening job', async () => {
    const submissionId = crypto.randomUUID()
    const add = spyOnCopyrightAgentEnqueue(ai_agents)
    await enqueueCopyrightFormScreeningAndWait(submissionId)
    expect(add).toHaveBeenCalledWith(
      'copyright-form-screening',
      { submission_id: submissionId },
      expect.objectContaining({
        jobId: `copyright_form_screening_${submissionId}`,
        deduplication: { id: `copyright_form_screening_${submissionId}`, mode: 'simple' },
        ordering: { key: `copyright_form_screening_${submissionId}`, concurrency: 1 },
      }),
    )
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
