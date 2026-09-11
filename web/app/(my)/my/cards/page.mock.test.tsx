import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ListResponse } from '@/types/api-responses'
import type { IndividualCard } from '@/types/my'

const { mockGetMyCards } = vi.hoisted(() => ({
  mockGetMyCards: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({ getMyCards: mockGetMyCards }))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: () => <div />,
}))
vi.mock(import('@/components/my/cards-manager'), () => ({
  CardsManager: ({ initialData }: { initialData: ListResponse<IndividualCard> }) => (
    <div data-testid='cards-page-data'>
      {initialData.results.map(card => card.card.name).join(',')}
      {`|${initialData.page_info.end_cursor}`}
    </div>
  ),
}))

import CardsPage from './page'

describe('CardsPage', () => {
  it('passes the complete server-rendered first page to CardsManager', async () => {
    mockGetMyCards.mockResolvedValue({
      results: [
        {
          id: 'card-1',
          card: { name: 'Named card' },
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'cursor-start',
        end_cursor: 'cursor-end',
      },
    })

    render(await CardsPage())

    expect(mockGetMyCards).toHaveBeenCalledWith({ limit: 25 })
    expect(screen.getByTestId('cards-page-data')).toHaveTextContent('Named card|cursor-end')
  })
})
