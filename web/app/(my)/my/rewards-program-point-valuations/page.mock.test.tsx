import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { getMyRewardsProgramPointValuationsMock } = vi.hoisted(() => ({
  getMyRewardsProgramPointValuationsMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMyRewardsProgramPointValuations: getMyRewardsProgramPointValuationsMock,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/components/my/point-valuations-manager'), () => ({
  PointValuationsManager: ({
    initialData,
  }: {
    initialData: {
      results: { rewards_program: { name: string } }[]
      page_info: { end_cursor: string | null }
    }
  }) => (
    <div data-testid='point-valuations-page-data'>
      {`${initialData.results[0]?.rewards_program.name ?? ''}|${initialData.page_info.end_cursor ?? ''}`}
    </div>
  ),
}))

import PointValuationsPage from './page'

describe('PointValuationsPage', () => {
  it('renders the shared settings header and passes the first page to the manager', async () => {
    getMyRewardsProgramPointValuationsMock.mockResolvedValue({
      results: [
        {
          id: 'valuation-1',
          rewards_program: { name: 'Chase Ultimate Rewards' },
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'cursor-start',
        end_cursor: 'cursor-end',
      },
    })

    render(await PointValuationsPage())

    expect(getMyRewardsProgramPointValuationsMock).toHaveBeenCalledWith({ limit: 25 })
    expect(document.querySelector('[data-pw="settings-page-header"]')).toBeInTheDocument()
    expect(document.querySelector('[data-pw="settings-page-header-title"]')).toHaveTextContent(
      'extracted.rewardsProgramPointValuations.page.pointValuations_f90821b2',
    )
    expect(
      document.querySelector('[data-pw="settings-page-header-description"]'),
    ).toHaveTextContent(
      'extracted.rewardsProgramPointValuations.page.manageYourRewardsProgramPointValuations_e3bcc429',
    )
    expect(screen.getByTestId('point-valuations-page-data')).toHaveTextContent(
      'Chase Ultimate Rewards|cursor-end',
    )
  })
})
