import { describe, expect, it } from 'vitest'
import {
  enqueueCopyrightEmailIntake,
  enqueueOrRetryCopyrightEmailIntake,
} from './copyright-email-intake.mts'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import { ai_agents } from '../queues.mts'
import {
  completedCopyrightAgentEnqueueRecovery,
  failedCopyrightAgentEnqueueRecovery,
} from '../../../test-helpers/copyright-agent-enqueue-recovery-tests.mts'

describe('copyright email intake enqueue recovery', () => {
  it('persists an ordered, deduplicated extraction job', async () => {
    const intakeId = crypto.randomUUID()
    const jobId = `copyright_email_intake_${intakeId}`
    try {
      await enqueueCopyrightEmailIntake(intakeId)
      // The in-memory GlideMQ shim records the options the enqueue passed. It does not prove
      // Valkey deduplication or ordering.
      await expect(ai_agents.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'copyright-email-intake',
        data: { intake_id: intakeId },
        opts: {
          attempts: AI_AGENTS_DEFAULTS.attempts,
          backoff: AI_AGENTS_DEFAULTS.backoff,
          priority: AGENT_PRIORITY['copyright-email-intake'],
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
