import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientRequest } from '../request'
import { ApiError } from '../../error'
import {
  BOT_CHALLENGE_ACTION_TAG,
  BOT_CHALLENGE_REQUIRED,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from '@ts-shared/utils/bot-challenge'

describe('ClientRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves cancellation identity and forwards the caller signal', async () => {
    const cancellation = new DOMException('The caller canceled the request', 'AbortError')
    const controller = new AbortController()
    controller.abort(cancellation)
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(cancellation)
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new ClientRequest().get('/api/example', { signal: controller.signal }),
    ).rejects.toBe(cancellation)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/example',
      expect.objectContaining({ signal: controller.signal }),
    )
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('returns undefined for successful empty 200 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(new Response(null, { status: 200 })),
    )

    await expect(new ClientRequest().delete('/api/example')).resolves.toBeUndefined()
  })

  it('preserves Retry-After for an admission-in-progress conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(
        errorResponse(
          409,
          {
            code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
            message: 'This contribution is still being processed. Please retry.',
          },
          '3',
        ),
      ),
    )

    await expect(new ClientRequest().post('/api/posts', {})).rejects.toMatchObject({
      status: 409,
      code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
      data: {
        code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
        retry_after: 3,
      },
    })
  })

  it.each([undefined, 'invalid', '0'])(
    'leaves retry_after empty for an admission conflict with header %s',
    async retryAfter => {
      vi.stubGlobal(
        'fetch',
        vi.fn<VitestLooseMock>().mockResolvedValue(
          errorResponse(
            409,
            {
              code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
              message: 'This contribution is still being processed. Please retry.',
            },
            retryAfter,
          ),
        ),
      )

      await expect(new ClientRequest().post('/api/posts', {})).rejects.toMatchObject({
        status: 409,
        data: {
          code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
          retry_after: undefined,
        },
      })
    },
  )

  it('does not attach Retry-After to an unrelated conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(
        errorResponse(
          409,
          {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This Idempotency-Key was already used for a different request.',
          },
          '5',
        ),
      ),
    )

    const error = await captureApiError(new ClientRequest().post('/api/posts', {}))
    expect(error).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    })
    expect(error.data).toEqual({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'This Idempotency-Key was already used for a different request.',
    })
  })

  it('continues preserving Retry-After for rate limits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(errorResponse(429, { message: 'Slow down' }, '7')),
    )

    await expect(new ClientRequest().post('/api/posts', {})).rejects.toMatchObject({
      status: 429,
      data: { message: 'Slow down', retry_after: 7 },
    })
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

async function captureApiError(request: Promise<unknown>): Promise<ApiError> {
  try {
    await request
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('Expected API request to reject')
}
