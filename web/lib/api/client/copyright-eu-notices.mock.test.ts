import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('./instance'),
  () =>
    ({ clientApi: { post: vi.fn<VitestLooseMock>() } }) as unknown as typeof import('./instance'),
)

import { createCopyrightEuNotice, createCopyrightEuRedress } from './copyright-eu-notices'
import { clientApi } from './instance'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import { makeCopyrightEuRedressResponse } from '@/test-helpers/api-responses/copyright-eu'
import { makeCopyrightEuNoticeResponse } from '@/test-helpers/api-responses/copyright'
import type { CopyrightEuNoticeInput } from '@/types/copyright-eu'

const mockPost = vi.mocked(clientApi.post)

function noticeInput(): CopyrightEuNoticeInput {
  const suffix = crypto.randomUUID()
  return {
    notifier_name: 'Notifying artist',
    notifier_email: `artist-${suffix}@example.test`,
    has_good_faith_statement: true,
    contact: 'Reply to the notifying artist',
    content_description: 'Photograph',
    grounds: 'The hosted use reproduces the photograph.',
    hosted_use_url: `https://example.test/hosted/${suffix}`,
    cf_turnstile_response: 'initial-captcha',
  }
}

describe('EU copyright client submissions', () => {
  afterEach(() => vi.clearAllMocks())

  it('posts a notice with an idempotency key and returns the receipt', async () => {
    const input = noticeInput()
    await expectApiWrapperCall({
      mock: mockPost,
      response: makeCopyrightEuNoticeResponse(),
      call: () => createCopyrightEuNotice(input),
      expectedArgs: [
        '/api/v1/copyright-eu-notices',
        input,
        { headers: { 'Idempotency-Key': expect.any(String) } },
      ],
    })
  })

  it('posts a complaint to its notice with an idempotency key', async () => {
    const noticeId = crypto.randomUUID()
    const input = {
      explanation: 'The decision overlooked my license.',
      cf_turnstile_response: 'captcha',
    }
    await expectApiWrapperCall({
      mock: mockPost,
      response: makeCopyrightEuRedressResponse(),
      call: () => createCopyrightEuRedress(noticeId, input),
      expectedArgs: [
        `/api/v1/copyright-eu-notices/${noticeId}/redress-requests`,
        input,
        { headers: { 'Idempotency-Key': expect.any(String) } },
      ],
    })
  })

  it('reuses the notice key after a lost response and a new CAPTCHA token', async () => {
    const input = noticeInput()
    mockPost.mockRejectedValueOnce(new Error('response lost'))
    mockPost.mockResolvedValueOnce(makeCopyrightEuNoticeResponse(true))

    await expect(createCopyrightEuNotice(input)).rejects.toThrow('response lost')
    await createCopyrightEuNotice({ ...input, cf_turnstile_response: 'replacement-captcha' })

    expect(mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key']).toEqual(expect.any(String))
    expect(mockPost.mock.calls[1]?.[2]?.headers?.['Idempotency-Key']).toBe(
      mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key'],
    )
  })

  it('reuses a complaint key only for the same notice and body', async () => {
    const noticeId = crypto.randomUUID()
    const input = {
      explanation: 'The decision overlooked my license.',
      cf_turnstile_response: 'captcha',
    }
    mockPost.mockRejectedValueOnce(new Error('response lost'))
    mockPost.mockResolvedValueOnce(makeCopyrightEuRedressResponse(true))
    mockPost.mockResolvedValueOnce(makeCopyrightEuRedressResponse())

    await expect(createCopyrightEuRedress(noticeId, input)).rejects.toThrow('response lost')
    await createCopyrightEuRedress(noticeId, { ...input, cf_turnstile_response: 'new-captcha' })
    await createCopyrightEuRedress(crypto.randomUUID(), input)

    expect(mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key']).toEqual(expect.any(String))
    expect(mockPost.mock.calls[1]?.[2]?.headers?.['Idempotency-Key']).toBe(
      mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key'],
    )
    expect(mockPost.mock.calls[2]?.[2]?.headers?.['Idempotency-Key']).not.toBe(
      mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key'],
    )
  })
})
