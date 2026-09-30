import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  integrityFlagsEmptyPage,
  registerReportIntegrityFlagsPageCases,
} from '@/test-helpers/app/integrity-flags-page-cases'
import {
  IntegrityFlagsBreadcrumbsDouble,
  IntegrityFlagsClientDouble,
} from '@/test-helpers/app/integrity-flags-page-doubles'

const { mockGetReportIntegrityFlags } = vi.hoisted(() => ({
  mockGetReportIntegrityFlags: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getReportIntegrityFlags: mockGetReportIntegrityFlags,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: IntegrityFlagsBreadcrumbsDouble,
}))

vi.mock(import('../report-integrity-flags-client'), () => ({
  ReportIntegrityFlagsClient: IntegrityFlagsClientDouble,
}))

import ReportIntegrityFlagsPage from '../page'

describe('ReportIntegrityFlagsPage', () => {
  registerReportIntegrityFlagsPageCases({
    Page: ReportIntegrityFlagsPage,
    getFlags: mockGetReportIntegrityFlags,
  })

  it('defaults to pending for missing status param', async () => {
    mockGetReportIntegrityFlags.mockResolvedValueOnce(integrityFlagsEmptyPage)

    render(await ReportIntegrityFlagsPage({ searchParams: Promise.resolve({}) }))

    expect(document.querySelector('[data-pw="integrity-flags-page-client"]')).toHaveTextContent(
      'pending',
    )
  })
})
