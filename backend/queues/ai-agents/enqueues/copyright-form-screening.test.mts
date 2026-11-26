import { describe, expect, it } from 'vitest'
import {
  enqueueCopyrightFormScreening,
  enqueueCopyrightFormScreenings,
} from './copyright-form-screening.mts'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import { ai_agents } from '../queues.mts'

describe('copyright form screening enqueue', () => {
  it('persists an ordered, deduplicated anti-spam screening job', async () => {
    const submissionId = crypto.randomUUID()
    const jobId = `copyright_form_screening_${submissionId}`
    try {
      await enqueueCopyrightFormScreening(submissionId)
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
          // No run row exists, so both terminal states release the id for the next sweep.
          removeOnComplete: true,
          removeOnFail: true,
          deduplication: { id: jobId, mode: 'simple' },
          ordering: { key: jobId, concurrency: 1 },
        },
      })
    } finally {
      await (await ai_agents.getJob(jobId))?.remove()
    }
  })

  it('adds a page of submissions in one call', async () => {
    const submissionIds = [crypto.randomUUID(), crypto.randomUUID()]
    const jobIds = submissionIds.map(id => `copyright_form_screening_${id}`)
    try {
      await enqueueCopyrightFormScreenings(submissionIds)
      const jobs = await Promise.all(jobIds.map(id => ai_agents.getJob(id)))
      expect(jobs.map(job => job?.data)).toEqual(submissionIds.map(id => ({ submission_id: id })))
    } finally {
      await Promise.all(jobIds.map(async id => (await ai_agents.getJob(id))?.remove()))
    }
  })
})
