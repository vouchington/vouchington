import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientRequest } from '@vouchington/api-client'
import {
  BOT_CHALLENGE_ACTION_TAG,
  BOT_CHALLENGE_REQUIRED,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from '@ts-shared/utils/bot-challenge'
import { createBotChallengeFetch } from '../bot-challenge-fetch'

type Solver = (actionTag: string, signal?: AbortSignal) => Promise<string>

function challengeResponse(action: string = BOT_CHALLENGE_ACTION_TAG): Response {
  return new Response(
    JSON.stringify({ action, code: BOT_CHALLENGE_REQUIRED, message: 'Bot challenge required' }),
    { status: 403 },
  )
}

function clientWith(solve: Solver): ClientRequest {
  return new ClientRequest({ fetch: createBotChallengeFetch(solve) })
}

describe('createBotChallengeFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('solves a low-score challenge and replays the unchanged mutation exactly once', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const solve = vi.fn<Solver>().mockResolvedValue('single-use-proof')

    await expect(clientWith(solve).post('/api/posts', { title: 'Replay safely' })).resolves.toEqual(
      { created: true },
    )

    expect(solve).toHaveBeenCalledWith(BOT_CHALLENGE_ACTION_TAG, undefined)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(second.body).toBe(first.body)
    expect(second.signal).toBe(first.signal)
    expect(second.headers).toMatchObject({
      [VOUCHA_BOT_CHALLENGE_TOKEN_HEADER]: 'single-use-proof',
    })
  })

  it('never replays a mutation more than once when the challenge response repeats', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(challengeResponse())
    vi.stubGlobal('fetch', fetchMock)
    const solve = vi.fn<Solver>().mockResolvedValue('single-use-proof')

    await expect(clientWith(solve).delete('/api/posts/post-id')).rejects.toMatchObject({
      status: 403,
      code: BOT_CHALLENGE_REQUIRED,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(solve).toHaveBeenCalledTimes(1)
  })

  it('does not replay when challenge acquisition fails', async () => {
    const fetchMock = vi.fn<VitestLooseMock>().mockResolvedValue(challengeResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      clientWith(() => Promise.reject(new Error('challenge canceled'))).post('/api/posts', {
        title: 'Do not replay',
      }),
    ).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not solve an error with a noncanonical challenge action', async () => {
    vi.stubGlobal('fetch', vi.fn<VitestLooseMock>().mockResolvedValue(challengeResponse('other')))
    const solve = vi.fn<Solver>().mockResolvedValue('unused')

    await expect(clientWith(solve).post('/api/posts', {})).rejects.toMatchObject({ status: 403 })
    expect(solve).not.toHaveBeenCalled()
  })

  it('passes non-403 responses through without parsing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(new Response('{}', { status: 200 })),
    )
    const solve = vi.fn<Solver>()

    await expect(clientWith(solve).get('/api/example')).resolves.toEqual({})
    expect(solve).not.toHaveBeenCalled()
  })
})
