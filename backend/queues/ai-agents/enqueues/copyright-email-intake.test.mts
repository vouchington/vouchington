import { describe, expect, it } from 'vitest'
import {
  enqueueCopyrightEmailIntakeAndWait,
  enqueueOrRetryCopyrightEmailIntake,
} from './copyright-email-intake.mts'
import { ai_agents } from '../queues.mts'
import {
  completedCopyrightAgentEnqueueRecovery,
  failedCopyrightAgentEnqueueRecovery,
  restoreCopyrightAgentEnqueueSpies,
  spyOnCopyrightAgentEnqueue,
} from '../../../test-helpers/copyright-agent-enqueue-recovery-tests.mts'

describe('copyright email intake enqueue recovery', () => {
  restoreCopyrightAgentEnqueueSpies()

  it('creates an ordered, deduplicated extraction job', async () => {
    const intakeId = crypto.randomUUID()
    const add = spyOnCopyrightAgentEnqueue(ai_agents)
    await enqueueCopyrightEmailIntakeAndWait(intakeId)
    expect(add).toHaveBeenCalledWith(
      'copyright-email-intake',
      { intake_id: intakeId },
      expect.objectContaining({
        jobId: `copyright_email_intake_${intakeId}`,
        deduplication: { id: `copyright_email_intake_${intakeId}`, mode: 'simple' },
        ordering: { key: `copyright_email_intake_${intakeId}`, concurrency: 1 },
      }),
    )
  })

  it('retries a retained failed extraction job', async () => {
    const { retry, enqueue, dependencies } =
      failedCopyrightAgentEnqueueRecovery('copyright-email-intake')
    await enqueueOrRetryCopyrightEmailIntake('intake-id', dependencies)
    expect(retry).toHaveBeenCalledOnce()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('removes a completed extraction job before enqueuing recovery', async () => {
    const { remove, enqueue, dependencies } =
      completedCopyrightAgentEnqueueRecovery('copyright-email-intake')
    await enqueueOrRetryCopyrightEmailIntake('intake-id', dependencies)
    expect(remove).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('intake-id')
  })
})
