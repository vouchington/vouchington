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
  assessCopyrightLegalHold,
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightNotice,
  getCopyrightNotice,
  getCopyrightParticipantNotice,
  listCopyrightNotices,
  listCopyrightReviewQueue,
  replayCopyrightActionIntent,
  replayCopyrightDeliveryIntent,
  replayCopyrightMediaDelivery,
  resolveCopyrightLegalHold,
  reviewCopyrightAppeal,
  reviewCopyrightCounterNotice,
  reviewCopyrightFormIntake,
  reviewCopyrightRestriction,
} from '../copyright-notices'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { CopyrightNoticesPage, CopyrightStaffQueuePage } from '@/types/copyright-notices'

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

  it('forwards the opaque staff queue continuation cursor', async () => {
    const staffResponse: CopyrightStaffQueuePage = {
      copyright_notices: [],
      page_info: { has_next_page: false, start_cursor: 'next', end_cursor: 'next' },
    }
    await expectApiWrapperCall({
      mock: mockGet,
      response: staffResponse,
      call: () => listCopyrightReviewQueue({ after: 'next', limit: 50 }),
      expectedArgs: [
        '/api/v1/copyright-notices/review-queue',
        { searchParams: { after: 'next', limit: 50 } },
      ],
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

  it('reads public, participant, and staff notice surfaces', async () => {
    expect.hasAssertions()
    mockGet.mockClear()
    const notice = { copyright_notice: { id: 'notice-1' } }
    await expectGet(notice, () => getCopyrightNotice('notice-1'), [
      '/api/v1/copyright-notices/notice-1',
    ])
    await expectGet(notice, () => getCopyrightParticipantNotice('notice-1'), [
      '/api/v1/copyright-notices/notice-1/participant',
    ])
    await expectGet(
      {
        copyright_notices: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      },
      () => listCopyrightReviewQueue(),
      [
        '/api/v1/copyright-notices/review-queue',
        { searchParams: { after: undefined, limit: undefined } },
      ],
    )
  })

  it('posts staff review, legal-hold, and replay actions', async () => {
    expect.hasAssertions()
    await expectPost(undefined, () => reviewCopyrightFormIntake('intake-1', true, 'Accepted.'), [
      '/api/v1/copyright-form-intakes/intake-1/reviews',
      { accepted: true, rationale: 'Accepted.' },
    ])
    await expectPost(
      undefined,
      () => reviewCopyrightRestriction('notice-1', 'restriction-1', 'confirm', 'Keep.'),
      [
        '/api/v1/copyright-notices/notice-1/restrictions/restriction-1/reviews',
        { action: 'confirm', rationale: 'Keep.' },
      ],
    )
    const appeal = {
      rationale: 'Keep the restriction.',
      decisions: [{ restriction_id: 'restriction-1', action: 'confirm' as const }],
    }
    await expectPost(undefined, () => reviewCopyrightAppeal('submission-1', appeal), [
      '/api/v1/copyright-submissions/submission-1/appeal-reviews',
      appeal,
    ])
    await expectPost(
      undefined,
      () => reviewCopyrightCounterNotice('submission-1', false, 'Incomplete.'),
      [
        '/api/v1/copyright-submissions/submission-1/counter-notice-reviews',
        { accepted: false, rationale: 'Incomplete.' },
      ],
    )
    const hold = {
      rationale: 'Verified CCB filing.',
      from_original_claimant: true,
      proceeding_kind: 'ccb' as const,
      ccb_claim_kind: 'claim' as const,
      commenced_at: '2026-07-01T12:00:00.000Z',
      received_by_designated_agent_at: '2026-07-01T12:30:00.000Z',
      same_material: true,
      target_ids: ['target-1'],
    }
    await expectPost(undefined, () => assessCopyrightLegalHold('submission-1', hold), [
      '/api/v1/copyright-submissions/submission-1/legal-hold-assessments',
      hold,
    ])
    await expectPost(
      undefined,
      () => resolveCopyrightLegalHold('hold-1', 'dismissed', 'Dismissed.'),
      [
        '/api/v1/copyright-legal-hold-assessments/hold-1/resolutions',
        { resolution_kind: 'dismissed', rationale: 'Dismissed.' },
      ],
    )
    await expectPost({ replayed: 1 }, () => replayCopyrightMediaDelivery(), [
      '/api/v1/copyright-media-delivery/replays',
      {},
    ])
    await expectPost(undefined, () => replayCopyrightActionIntent('notice-1', 'intent-1'), [
      '/api/v1/copyright-notices/notice-1/action-intents/intent-1/replays',
      {},
    ])
    await expectPost(undefined, () => replayCopyrightDeliveryIntent('notice-1', 'intent-1'), [
      '/api/v1/copyright-notices/notice-1/delivery-intents/intent-1/replays',
      {},
    ])
  })
})

async function expectGet(
  response: unknown,
  call: () => Promise<unknown>,
  expectedArgs: readonly unknown[],
) {
  mockGet.mockClear()
  await expectApiWrapperCall({ mock: mockGet, response, call, expectedArgs })
}

async function expectPost(
  response: unknown,
  call: () => Promise<unknown>,
  expectedArgs: readonly unknown[],
) {
  mockPost.mockClear()
  await expectApiWrapperCall({ mock: mockPost, response, call, expectedArgs })
}
