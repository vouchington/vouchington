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
  decideCopyrightTerritorialRedress,
  listCopyrightEuStaffDisputeSettlements,
  listCopyrightTerritorialComplaints,
  recordCopyrightEuDisputeSettlementImplementation,
  recordCopyrightEuDisputeSettlementOutcome,
  referCopyrightEuDisputeSettlement,
} from '../copyright-territorial-redress'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const mockPost = vi.mocked(clientApi.post)
const mockGet = vi.mocked(clientApi.get)

describe('territorial redress client', () => {
  afterEach(() => vi.clearAllMocks())

  it.each([
    ['eu_dsa', '/api/v1/copyright-eu-notices/notice-1/redress-requests/complaint-1/decisions'],
    ['uk', '/api/v1/copyright-uk-notices/notice-1/redress-requests/complaint-1/decisions'],
  ] as const)('posts the %s complaint decision', async (jurisdiction, path) => {
    const response = { result: 'recorded' }
    const input = { staff_disposition: 'revoke' as const, rationale: 'The complaint is supported.' }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () => decideCopyrightTerritorialRedress(jurisdiction, 'notice-1', 'complaint-1', input),
      expectedArgs: [path, input],
    })
  })

  it('posts referral, outcome and implementation to the EU routes', async () => {
    const response = { result: 'recorded' }
    const referral = {
      body_name: 'Independent dispute body',
      referred_at: '2026-10-01T10:00:00Z',
      referred_by_party: 'notifier' as const,
    }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () => referCopyrightEuDisputeSettlement('notice-2', referral),
      expectedArgs: ['/api/v1/copyright-eu-notices/notice-2/dispute-settlements', referral],
    })
    mockPost.mockClear()
    const outcome = { result: 'decided_for_recipient' as const, decided_at: '2026-10-02T10:00:00Z' }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () => recordCopyrightEuDisputeSettlementOutcome('notice-2', 'referral-1', outcome),
      expectedArgs: [
        '/api/v1/copyright-eu-notices/notice-2/dispute-settlements/referral-1/outcomes',
        outcome,
      ],
    })
    mockPost.mockClear()
    const implementation = { implemented_at: '2026-10-03T10:00:00Z' }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () =>
        recordCopyrightEuDisputeSettlementImplementation('notice-2', 'referral-1', implementation),
      expectedArgs: [
        '/api/v1/copyright-eu-notices/notice-2/dispute-settlements/referral-1/implementations',
        implementation,
      ],
    })
  })

  it('continues complaint and EU dispute staff lists with the supplied cursor', async () => {
    const complaints = {
      copyright_territorial_complaints: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    mockGet.mockResolvedValueOnce(complaints)
    await listCopyrightTerritorialComplaints('notice-3', { after: 'complaint-cursor' })
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/v1/copyright-notices/notice-3/territorial-complaints',
      { searchParams: { after: 'complaint-cursor' } },
    )

    const settlements = {
      copyright_eu_dispute_settlements: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    mockGet.mockResolvedValueOnce(settlements)
    await listCopyrightEuStaffDisputeSettlements('notice-3', { after: 'settlement-cursor' })
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/v1/copyright-notices/notice-3/eu-dispute-settlements/staff',
      { searchParams: { after: 'settlement-cursor' } },
    )
  })
})
