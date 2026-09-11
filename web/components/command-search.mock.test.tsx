import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { CommandSearch } from './command-search'

vi.mock(import('next/navigation'), () => navMockModule)

// getFeatureFlagSnapshot is imported after the mock so vi.mocked() can spy on it
vi.mock(import('@/lib/feature-flags/cookies'), () => ({
  getFeatureFlagOverrides: vi.fn<() => Record<string, boolean>>().mockReturnValue({}),
  getFeatureFlagServerSnapshot: vi.fn<() => Record<string, boolean>>().mockReturnValue({}),
  getFeatureFlagSnapshot: vi.fn<() => Record<string, boolean>>().mockReturnValue({}),
}))

vi.mock(import('./command-search-data-search'), async importOriginal => {
  const original = await importOriginal<typeof import('./command-search-data-search')>()
  return {
    ...original,
    searchAllProgressive: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  }
})

const { mockSearchByTab } = vi.hoisted(() => ({
  mockSearchByTab: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('./command-search-data'), async importOriginal => {
  const original = await importOriginal<typeof import('./command-search-data')>()
  return { ...original, searchByTab: mockSearchByTab }
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

vi.mock(import('@/lib/api/client/fediverse'), () => ({
  fetchFediverseSearch: vi.fn<VitestLooseMock>().mockResolvedValue({
    buckets: [
      {
        provider: 'peertube',
        status: 'ok',
        items: [
          {
            id: 'fediverse-1',
            provider: 'peertube',
            result_type: 'video',
            external_url: 'https://videos.example/watch/1',
            title: 'Test Video',
            source_hostname: 'videos.example',
          },
        ],
      },
    ],
  }),
}))

import { getFeatureFlagSnapshot } from '@/lib/feature-flags/cookies'
import { searchAllProgressive } from './command-search-data-search'
import { fetchCombinedSearch } from '@/lib/api/client/search'
import { fetchFediverseSearch } from '@/lib/api/client/fediverse'

const mockGetFeatureFlagSnapshot = vi.mocked(getFeatureFlagSnapshot)
const mockSearchAllProgressive = vi.mocked(searchAllProgressive)
const mockFetchCombinedSearch = vi.mocked(fetchCombinedSearch)
const mockFetchFediverseSearch = vi.mocked(fetchFediverseSearch)

function renderSearch() {
  return render(
    <CommandSearch
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      isAdmin={false}
      isAuthenticated={false}
    />,
  )
}

describe('CommandSearch', () => {
  it('renders the type filter as a named control group', () => {
    renderSearch()
    expect(screen.getByRole('group', { name: 'Filter by type' })).toBeInTheDocument()
  })

  it('renders Communities tab button', () => {
    renderSearch()
    expect(screen.getByRole('button', { name: 'Communities' })).toBeInTheDocument()
  })

  describe('search effect — flag-based branching', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.clearAllMocks()
      mockGetFeatureFlagSnapshot.mockReturnValue({})
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('uses searchAllProgressive when combinedSearch flag is off and tab is "all"', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ combinedSearch: false })
      renderSearch()

      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'hello' } })

      // Advance past the 300ms debounce
      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockSearchAllProgressive).toHaveBeenCalled()
      expect(mockFetchCombinedSearch).not.toHaveBeenCalled()
    })

    it('uses fetchCombinedSearch when combinedSearch flag is on', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ combinedSearch: true })
      renderSearch()

      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'hello' } })

      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockFetchCombinedSearch).toHaveBeenCalled()
      expect(mockSearchAllProgressive).not.toHaveBeenCalled()
    })

    it('adds Fediverse results to combined search when fediverse flag is on', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ combinedSearch: true, fediverse: true })
      renderSearch()

      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'video' } })

      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockFetchCombinedSearch).toHaveBeenCalled()
      expect(mockFetchFediverseSearch).toHaveBeenCalledWith({
        q: 'video',
        limit: 3,
        signal: expect.any(AbortSignal),
      })
      expect(screen.getByRole('button', { name: 'Fediverse' })).toBeInTheDocument()
    })

    it('uses fetchCombinedSearch only for "all" tab when flag is on — specific tab falls through to searchByTab', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ combinedSearch: true })
      mockSearchByTab.mockResolvedValue({
        topics: [],
        posts: [],
        news: [],
        domains: [],
        communities: [],
        fediverse: [],
      })
      renderSearch()

      // Switch to Topics tab
      fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'hello' } })

      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockFetchCombinedSearch).not.toHaveBeenCalled()
      expect(mockSearchByTab).toHaveBeenCalledWith('hello', 'topics', expect.any(AbortSignal))
    })

    it('uses searchByTab on specific tab when flag is off', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ combinedSearch: false })
      mockSearchByTab.mockResolvedValue({
        topics: [],
        posts: [],
        news: [],
        domains: [],
        communities: [],
        fediverse: [],
      })
      renderSearch()

      fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'rust' } })

      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockSearchByTab).toHaveBeenCalledWith('rust', 'topics', expect.any(AbortSignal))
      expect(mockSearchAllProgressive).not.toHaveBeenCalled()
    })

    it('clears results on searchByTab error', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ combinedSearch: false })
      mockSearchByTab.mockRejectedValue(new Error('Network error'))
      renderSearch()

      fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'fail' } })

      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockSearchByTab).toHaveBeenCalled()
    })

    it('clears results on fetchCombinedSearch error', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ combinedSearch: true })
      mockFetchCombinedSearch.mockRejectedValue(new Error('Server error'))
      renderSearch()

      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'fail' } })

      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockFetchCombinedSearch).toHaveBeenCalled()
    })

    it('adds Fediverse results to progressive all search when only fediverse flag is on', async () => {
      mockGetFeatureFlagSnapshot.mockReturnValue({ fediverse: true })
      renderSearch()

      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'post' } })

      await act(async () => {
        vi.advanceTimersByTime(350)
        await Promise.resolve()
      })

      expect(mockSearchAllProgressive).toHaveBeenCalled()
      expect(mockFetchFediverseSearch).toHaveBeenCalledWith({
        q: 'post',
        limit: 3,
        signal: expect.any(AbortSignal),
      })
    })
  })
})
