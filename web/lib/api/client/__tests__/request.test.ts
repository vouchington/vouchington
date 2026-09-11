import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientRequest } from '../request'
import { ApiError } from '../../error'

describe('ClientRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('Expected API request to reject')
}
