import { describe, expect, it, vi } from 'vitest'

import {
  getGlideMQInstances,
  registerGlideMQInstance,
  unregisterGlideMQInstance,
} from '@data-stores/valkey-core/glide-mq-registry'
import { closeAndUnregisterGlideMQInstance } from '../glide-mq-factory.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => {
  class UnusedGlideMQHandle {}
  return {
    FlowProducer: UnusedGlideMQHandle as unknown as typeof import('glide-mq').FlowProducer,
    Queue: UnusedGlideMQHandle as unknown as typeof import('glide-mq').Queue,
    Worker: UnusedGlideMQHandle as unknown as typeof import('glide-mq').Worker,
  }
})

describe('GlideMQ temporary handle lifecycle', () => {
  it('unregisters a temporary handle only after its close succeeds', async () => {
    const instance = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) }
    registerGlideMQInstance(instance)

    await closeAndUnregisterGlideMQInstance(instance)

    expect(instance.close).toHaveBeenCalledOnce()
    expect(getGlideMQInstances()).not.toContain(instance)
  })

  it('keeps a failed-close handle registered for shutdown retry', async () => {
    const error = new Error('close failed')
    const instance = { close: vi.fn<() => Promise<void>>(() => Promise.reject(error)) }
    registerGlideMQInstance(instance)

    await expect(closeAndUnregisterGlideMQInstance(instance)).rejects.toBe(error)
    expect(getGlideMQInstances()).toContain(instance)
    unregisterGlideMQInstance(instance)
  })
})
