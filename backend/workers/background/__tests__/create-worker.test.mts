import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import * as queueDomainControls from '@services/queue-domain-controls'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

// An isolated prefix keeps these workers away from the shared `background` queue's jobs.
function startWorker(concurrency?: number) {
  return createBackgroundWorker({
    handlers: BACKGROUND_HANDLERS,
    domains: ['ses-inbound'],
    prefix: `create_worker_${randomUUID().replaceAll('-', '')}`,
    ...(concurrency === undefined ? {} : { concurrency }),
  })
}

describe('background worker pause watcher', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([undefined, 1])(
    'closes the pause subscription together with the worker (concurrency %s)',
    async concurrency => {
      const close = vi.fn<() => Promise<void>>().mockResolvedValue()
      vi.spyOn(queueDomainControls, 'watchQueueDomainControls').mockResolvedValue({ close })
      const worker = startWorker(concurrency)

      await closeAndUnregisterGlideMQInstance(worker)

      expect(close).toHaveBeenCalledTimes(1)
      expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
    },
  )

  it('reports a failed subscription and still closes the worker', async () => {
    const failure = new Error('subscribe refused')
    vi.spyOn(queueDomainControls, 'watchQueueDomainControls').mockRejectedValue(failure)
    const worker = startWorker()

    await closeAndUnregisterGlideMQInstance(worker)

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(failure, expect.anything())
  })

  it('wraps a failure that is not an error before reporting it', async () => {
    vi.spyOn(queueDomainControls, 'watchQueueDomainControls').mockRejectedValue('subscribe refused')
    const worker = startWorker()

    await closeAndUnregisterGlideMQInstance(worker)

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Pause watcher failed', cause: 'subscribe refused' }),
      expect.anything(),
    )
  })
})
