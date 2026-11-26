import { describe, expect, it } from 'vitest'
import {
  enqueueCopyrightEmailIntake,
  enqueueCopyrightEmailIntakes,
} from './copyright-email-intake.mts'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import { ai_agents } from '../queues.mts'

describe('copyright email intake enqueue', () => {
  it('persists an ordered, deduplicated extraction job', async () => {
    const intakeId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const jobId = `copyright_email_intake_${runId}`
    try {
      await enqueueCopyrightEmailIntake(intakeId, runId)
      // The in-memory GlideMQ shim records the options the enqueue passed. It does not prove
      // Valkey deduplication or ordering.
      await expect(ai_agents.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'copyright-email-intake',
        data: { intake_id: intakeId, run_id: runId },
        opts: {
          attempts: AI_AGENTS_DEFAULTS.attempts,
          backoff: AI_AGENTS_DEFAULTS.backoff,
          priority: AGENT_PRIORITY['copyright-email-intake'],
          removeOnComplete: true,
          removeOnFail: true,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: { key: `copyright_email_intake_${intakeId}`, concurrency: 1 },
        },
      })
    } finally {
      await (await ai_agents.getJob(jobId))?.remove()
    }
  })

  it('adds a page of runs in one call, one job per run id', async () => {
    const items = [0, 1].map(() => ({ intakeId: crypto.randomUUID(), runId: crypto.randomUUID() }))
    const jobIds = items.map(item => `copyright_email_intake_${item.runId}`)
    try {
      await enqueueCopyrightEmailIntakes(items)
      const jobs = await Promise.all(jobIds.map(id => ai_agents.getJob(id)))
      expect(jobs.map(job => job?.data)).toEqual(
        items.map(item => ({ intake_id: item.intakeId, run_id: item.runId })),
      )
    } finally {
      await Promise.all(jobIds.map(async id => (await ai_agents.getJob(id))?.remove()))
    }
  })
})
