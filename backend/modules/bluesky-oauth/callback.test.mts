import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeBlueskyCallback } from './callback.mts'
import type { NodeOAuthClient, OAuthSession } from '@atproto/oauth-client-node'

describe('completeBlueskyCallback', () => {
  afterEach(() => vi.useRealTimers())

  it('classifies an aborted SDK callback as a Bluesky provider timeout with its cause', async () => {
    const controller = new AbortController()
    controller.abort()
    const err = controller.signal.reason
    const callback = vi.fn<(typeof NodeOAuthClient.prototype)['callback']>()
    callback.mockRejectedValue(err)
    const client = { callback } as Pick<NodeOAuthClient, 'callback'> as NodeOAuthClient

    const failure = await completeBlueskyCallback(
      async () => client,
      new URLSearchParams({ code: 'aborted' }),
    ).catch((err: unknown) => err)
    expect(failure).toMatchObject({
      status: 502,
      message: 'Bluesky OAuth provider request timed out',
      cause: err,
    })
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).cause).toBe(err)
  })

  it('preserves a non-timeout SDK failure without changing its identity', async () => {
    const err = new Error('Bluesky authorization code exchange failed')
    const callback = vi.fn<(typeof NodeOAuthClient.prototype)['callback']>()
    callback.mockRejectedValue(err)
    const client = { callback } as Pick<NodeOAuthClient, 'callback'> as NodeOAuthClient

    await expect(
      completeBlueskyCallback(async () => client, new URLSearchParams({ code: 'failed' })),
    ).rejects.toBe(err)
  })

  it('returns the SDK callback result through the bounded operation wrapper', async () => {
    const result = { session: { did: 'did:plc:test' } as unknown as OAuthSession, state: 'state' }
    const callback = vi.fn<(typeof NodeOAuthClient.prototype)['callback']>(async () => result)
    const client = { callback } as Pick<NodeOAuthClient, 'callback'> as NodeOAuthClient
    const getClient = vi.fn<(signal: AbortSignal) => Promise<NodeOAuthClient>>(
      async (_signal: AbortSignal) => client,
    )
    const params = new URLSearchParams({ code: 'code' })

    await expect(completeBlueskyCallback(getClient, params)).resolves.toBe(result)
    expect(getClient).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(callback).toHaveBeenCalledWith(params)
  })

  it('waits for SDK persistence to settle after the provider deadline', async () => {
    vi.useFakeTimers()
    const result = { session: { did: 'did:plc:test' } as unknown as OAuthSession, state: 'state' }
    let settleCallback!: () => void
    const callback = vi.fn<(typeof NodeOAuthClient.prototype)['callback']>(
      async () =>
        new Promise(resolve => {
          settleCallback = () => resolve(result)
        }),
    )
    const client = { callback } as Pick<NodeOAuthClient, 'callback'> as NodeOAuthClient
    const promise = completeBlueskyCallback(async () => client, new URLSearchParams({ code: 'x' }))

    await vi.advanceTimersByTimeAsync(10_000)
    const pending = Symbol('pending')
    expect(await Promise.race([promise, Promise.resolve(pending)])).toBe(pending)

    settleCallback()
    await expect(promise).resolves.toBe(result)
  })
})
