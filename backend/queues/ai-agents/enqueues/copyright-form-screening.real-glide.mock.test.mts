import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ai_agents } from '../queues.mts'
import { enqueueCopyrightFormScreeningAndWait } from './copyright-form-screening.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('copyright screening wakeup on real GlideMQ', () => {
  it('coalesces duplicate wakeups using only the stable submission ID', async () => {
    const submissionId = randomUUID()
    const jobId = `copyright_form_screening_${submissionId}`
    try {
      await Promise.all([
        enqueueCopyrightFormScreeningAndWait(submissionId),
        enqueueCopyrightFormScreeningAndWait(submissionId),
      ])
      const job = await ai_agents.getJob(jobId)
      expect(job?.name).toBe('copyright-form-screening')
      expect(job?.data).toEqual({ submission_id: submissionId })
      expect(job?.opts.ordering).toEqual({ key: jobId, concurrency: 1 })
      expect(job?.opts.deduplication).toEqual({ id: jobId, mode: 'simple' })
    } finally {
      const job = await ai_agents.getJob(jobId)
      if (job) await job.remove()
    }
  })
})
