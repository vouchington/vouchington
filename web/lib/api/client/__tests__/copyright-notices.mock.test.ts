import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { get: vi.fn<VitestLooseMock>(), post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightNotice,
  listCopyrightNotices,
} from '../copyright-notices'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { CopyrightNoticesPage } from '@/types/copyright-notices'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const response: CopyrightNoticesPage = {
  copyright_notices: [],
  page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'next' },
}

describe('copyright notices client', () => {
  afterEach(() => vi.clearAllMocks())

  it('forwards the opaque accepted-case continuation cursor', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => listCopyrightNotices({ after: 'next', limit: 100 }),
      expectedArgs: ['/api/v1/copyright-notices', { searchParams: { after: 'next', limit: 100 } }],
    })
  })

  it('reuses an idempotency key when a notice response is lost', async () => {
    const input = {
      claimant_display_name: 'Claimant',
      claimant_contact: '1 Main St',
      claimant_email: 'tests+0bdf859c@voucha.ai',
      work_description: 'A photograph',
      electronic_signature: 'Claimant',
      good_faith_belief: true,
      accuracy_authority_under_penalty_of_perjury: true,
      targets: [
        {
          post_id: '019f0000-0000-7000-8000-000000000001',
          image_id: '019f0000-0000-7000-8000-000000000002',
          target_url: 'https://voucha.ai/discussion/copyright-idempotency-test',
        },
      ],
      cf_turnstile_response: 'first-turnstile-token',
    }
    mockPost
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ copyright_notice: { id: 'notice-1' }, is_duplicate: true })

    await expect(createCopyrightNotice(input)).rejects.toThrow('response lost')
    await createCopyrightNotice({ ...input, cf_turnstile_response: 'replacement-turnstile-token' })

    const firstKey = mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key']
    expect(mockPost.mock.calls[1]?.[2]?.headers?.['Idempotency-Key']).toBe(firstKey)
  })

  it('reuses idempotency keys for appeal and counter-notice retries', async () => {
    const noticeId = '019f0000-0000-7000-8000-000000000010'
    const targetId = '019f0000-0000-7000-8000-000000000011'
    mockPost
      .mockRejectedValueOnce(new Error('appeal response lost'))
      .mockResolvedValueOnce({ copyright_submission: { id: 'appeal-1' }, is_duplicate: true })
      .mockRejectedValueOnce(new Error('counter response lost'))
      .mockResolvedValueOnce({ copyright_submission: { id: 'counter-1' }, is_duplicate: true })

    const appeal = { reason: 'This is my work.', target_ids: [targetId] }
    await expect(createCopyrightAppeal(noticeId, appeal)).rejects.toThrow('appeal response lost')
    await createCopyrightAppeal(noticeId, appeal)
    const counter = {
      name: 'Poster',
      address: '1 Main St',
      telephone: '555-0100',
      electronic_signature: 'Poster',
      consent_to_federal_jurisdiction: true,
      consent_to_service_of_process: true,
      good_faith_misidentification_under_penalty_of_perjury: true,
      target_ids: [targetId],
    }
    await expect(createCopyrightCounterNotice(noticeId, counter)).rejects.toThrow(
      'counter response lost',
    )
    await createCopyrightCounterNotice(noticeId, counter)

    expect(mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key']).toBe(
      mockPost.mock.calls[1]?.[2]?.headers?.['Idempotency-Key'],
    )
    expect(mockPost.mock.calls[2]?.[2]?.headers?.['Idempotency-Key']).toBe(
      mockPost.mock.calls[3]?.[2]?.headers?.['Idempotency-Key'],
    )
  })
})
