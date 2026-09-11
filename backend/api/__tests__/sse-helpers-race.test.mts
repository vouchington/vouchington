import { PassThrough } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import type { ChannelSubscription } from '@data-stores/valkey-pubsub'
import { describe, expect, it, vi } from 'vitest'
import { pipeChannelToSSE } from '../sse-helpers.mts'

describe('pipeChannelToSSE lifecycle races', () => {
  it('settles when the lifecycle expires between listener registration and its recheck', async () => {
    let abortedReads = 0
    const abortSignal = {
      get aborted() {
        abortedReads += 1
        return abortedReads > 1
      },
      addEventListener: vi.fn<VitestLooseMock>(),
      removeEventListener: vi.fn<VitestLooseMock>(),
    } as unknown as AbortSignal
    let handler: ((value: string) => void) | null = null
    const subscription: ChannelSubscription<string> = {
      setHandler: nextHandler => {
        handler = nextHandler
      },
      close: vi.fn<VitestLooseMock>(),
    }

    await pipeChannelToSSE({
      ctx: {} as Context,
      stream: new PassThrough(),
      subscription,
      eventName: 'state',
      abortSignal,
    })

    expect(handler).toBeNull()
  })
})
