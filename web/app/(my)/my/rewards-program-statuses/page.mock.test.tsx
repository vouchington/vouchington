import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { getMyRewardsProgramStatusesMock } = vi.hoisted(() => ({
  getMyRewardsProgramStatusesMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMyRewardsProgramStatuses: getMyRewardsProgramStatusesMock,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/components/my/rewards-program-statuses-manager'), () => ({
  RewardsProgramStatusesManager: ({
    initialPage,
  }: {
    initialPage: {
      results: { rewards_program_status: { name: string } }[]
      page_info: { end_cursor: string | null }
    }
  }) => (
    <div data-testid='rewards-program-statuses-page-data'>
      {`${initialPage.results[0]?.rewards_program_status.name ?? ''}|${initialPage.page_info.end_cursor ?? ''}`}
    </div>
  ),
}))

import RewardsProgramStatusesPage from './page'

describe('RewardsProgramStatusesPage', () => {
  it('renders the shared settings header and passes the first page to the manager', async () => {
    getMyRewardsProgramStatusesMock.mockResolvedValue({
      results: [
        {
          id: 'status-1',
          rewards_program_status: { name: 'Gold' },
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'cursor-start',
        end_cursor: 'cursor-end',
      },
    })

    render(await RewardsProgramStatusesPage())

    expect(getMyRewardsProgramStatusesMock).toHaveBeenCalledWith({ limit: 25 })
    expect(document.querySelector('[data-pw="settings-page-header"]')).toBeInTheDocument()
    expect(screen.getByTestId('rewards-program-statuses-page-data')).toHaveTextContent(
      'Gold|cursor-end',
    )
  })
})
