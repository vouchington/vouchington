import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { CommandSearch } from './command-search'

vi.mock(import('next/navigation'), () => navMockModule)
vi.mock(import('./command-search-data-search'), async importOriginal => {
  const original = await importOriginal<typeof import('./command-search-data-search')>()
  return {
    ...original,
    searchAllProgressive: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  }
})
vi.mock(import('@/lib/api/client/search'), () => ({
  fetchCombinedSearch: vi.fn<VitestLooseMock>().mockResolvedValue({
    topics: [],
    posts: [],
    news: [],
    domains: [],
    communities: [],
    fediverse: [],
  }),
}))

const { push } = createNavMock()

describe('CommandSearch navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    push.mockClear()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('pushes the selected page shortcut through the router', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(
      <CommandSearch
        open
        onOpenChange={onOpenChange}
        isAdmin={false}
        isAuthenticated={false}
      />,
    )

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'plans' } })
    fireEvent.click(screen.getByText('Plans'))

    expect(push).toHaveBeenCalledWith('/plans')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
