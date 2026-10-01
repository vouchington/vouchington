import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import type { CopyrightFormScreeningJobData } from '@queues/ai-agents/types'
import * as openaiProvider from '@modules/openai-utils/create-response'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { processCopyrightFormScreening } from './process-copyright-form-screening.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())
vi.mock(import('@modules/openai-utils/create-response'), async importOriginal => ({
  ...(await importOriginal()),
  createOpenAIResponse: vi.fn<typeof openaiProvider.createOpenAIResponse>(async () => {
    throw new Error('Completed screening must not call the provider')
  }),
}))

describe('copyright screening worker with real GlideMQ and PostgreSQL', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()

  it('recovers a completed screening effect and duplicate wakeup without repeating its provider', async () => {
    const { notice } = await createClearScreenedForm()
    const queueName = `copyright_screening_${randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new Queue<CopyrightFormScreeningJobData>(queueName, connection)
    const worker = new Worker<CopyrightFormScreeningJobData>(
      queueName,
      processCopyrightFormScreening,
      connection,
    )
    const errors: Error[] = []
    worker.on('error', error => errors.push(error))
    try {
      const data = { submission_id: notice.intake.copyright_notice_submission_id }
      const first = await queue.add('copyright-form-screening', data, { jobId: randomUUID() })
      if (!first) throw new Error('Expected first owned wakeup')
      await vi.waitFor(async () => expect(await first.getState()).toBe('completed'))
      const duplicate = await queue.add('copyright-form-screening', data, { jobId: randomUUID() })
      if (!duplicate) throw new Error('Expected duplicate owned wakeup')
      await vi.waitFor(async () => expect(await duplicate.getState()).toBe('completed'))
      expect(openaiProvider.createOpenAIResponse).not.toHaveBeenCalled()
      expect(errors).toEqual([])
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(1)
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
