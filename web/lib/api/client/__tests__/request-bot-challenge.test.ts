import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientRequest } from '../request'
import {
  BOT_CHALLENGE_ACTION_TAG,
  BOT_CHALLENGE_REQUIRED,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from '@ts-shared/utils/bot-challenge'

describe('ClientRequest bot challenge replay', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, _options: unknown, callback: () => Promise<boolean>) =>
          callback(),
      },
    })
    vi.stubGlobal('window', {
      location: {
        pathname: '/news',
        search: '?topic=owned',
        assign: vi.fn<(url: string) => void>(),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('solves a low-score challenge and replays the unchanged mutation exactly once', async () => {
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(
        errorResponse(403, {
          action: BOT_CHALLENGE_ACTION_TAG,
          code: BOT_CHALLENGE_REQUIRED,
          message: 'Bot challenge required',
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const solve = vi
      .fn<(actionTag: string, signal?: AbortSignal) => Promise<string>>()
      .mockResolvedValue('single-use-proof')

    await expect(
      new ClientRequest(solve).post('/api/posts', { title: 'Replay safely' }),
    ).resolves.toEqual({ created: true })

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
    const challenge = () =>
      errorResponse(403, {
        action: BOT_CHALLENGE_ACTION_TAG,
        code: BOT_CHALLENGE_REQUIRED,
        message: 'Bot challenge required',
      })
    const fetchMock = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(challenge())
    vi.stubGlobal('fetch', fetchMock)
    const solve = vi
      .fn<(actionTag: string, signal?: AbortSignal) => Promise<string>>()
      .mockResolvedValue('single-use-proof')

    await expect(new ClientRequest(solve).delete('/api/posts/post-id')).rejects.toMatchObject({
      status: 403,
      code: BOT_CHALLENGE_REQUIRED,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(solve).toHaveBeenCalledTimes(1)
  })

  it('does not replay when challenge acquisition fails', async () => {
    const fetchMock = vi.fn<VitestLooseMock>().mockResolvedValue(
      errorResponse(403, {
        action: BOT_CHALLENGE_ACTION_TAG,
        code: BOT_CHALLENGE_REQUIRED,
        message: 'Bot challenge required',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new ClientRequest(() => Promise.reject(new Error('challenge canceled'))).post('/api/posts', {
        title: 'Do not replay',
      }),
    ).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not solve an error with a noncanonical challenge action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(
        errorResponse(403, {
          action: 'other-action',
          code: BOT_CHALLENGE_REQUIRED,
          message: 'Bot challenge required',
        }),
      ),
    )
    const solve = vi
      .fn<(actionTag: string, signal?: AbortSignal) => Promise<string>>()
      .mockResolvedValue('unused')

    await expect(new ClientRequest(solve).post('/api/posts', {})).rejects.toMatchObject({
      status: 403,
    })
    expect(solve).not.toHaveBeenCalled()
  })
})

function errorResponse(
  status: number,
  body: Record<string, string>,
  retryAfter?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: retryAfter === undefined ? undefined : { 'Retry-After': retryAfter },
  })
}
