import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

import { getReportIntegrityFlags, getReportIntegrityPenalties } from './report-integrity'

describe('report-integrity server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  it('calls /api/v1/report-integrity/flags with default empty options', async () => {
    await getReportIntegrityFlags()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/report-integrity/flags', {})
  })

  it('calls /api/v1/report-integrity/flags with searchParams', async () => {
    const options = { searchParams: { status: 'pending' } }
    await getReportIntegrityFlags(options)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/report-integrity/flags', options)
  })

  it('calls /api/v1/report-integrity/flags with headers', async () => {
    const options = { headers: { cookie: 'session=abc' } }
    await getReportIntegrityFlags(options)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/report-integrity/flags', options)
  })

  it('returns the response from serverApi.get', async () => {
    const response = {
      results: [{ id: 'flag-1', flag_type: 'mass_report_suspected' }],
      page_info: { has_next_page: true, end_cursor: 'cursor-1', start_cursor: null },
    }
    mockGet.mockResolvedValueOnce(response)

    const result = await getReportIntegrityFlags()

    expect(result).toBe(response)
  })

  it('loads the report penalty collection', async () => {
    const options = { searchParams: { status: 'active' } }
    const response = { results: [{ id: 'penalty-1' }], page_info: {} }
    mockGet.mockResolvedValueOnce(response)

    const result = await getReportIntegrityPenalties(options)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/report-integrity/penalties', options)
    expect(result).toBe(response)
  })
})
