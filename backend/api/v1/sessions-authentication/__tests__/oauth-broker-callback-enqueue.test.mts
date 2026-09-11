import { describe, expect, it, vi } from 'vitest'
import { enqueueInitialOAuthAuthorizationExchangeBestEffort } from '../oauth-broker-callback-enqueue.mts'

describe('OAuth broker callback enqueue', () => {
  it('delivers the durable callback handoff when the initial enqueue fails', async () => {
    const enqueue = vi.fn<(authorizationId: string) => Promise<void>>(async () => {
      throw Object.assign(new Error('Valkey unavailable'), {
        tags: { suppressLogging: true },
      })
    })

    await expect(
      enqueueInitialOAuthAuthorizationExchangeBestEffort('authorization-id', enqueue),
    ).resolves.toBeUndefined()
    expect(enqueue).toHaveBeenCalledWith('authorization-id')
  })
})
