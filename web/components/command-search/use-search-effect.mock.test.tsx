import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_RESULTS, type SearchResults } from '../command-search-data'
import { useSearchEffect } from './use-search-effect'
import { fetchCombinedSearch } from '@/lib/api/client/search'
import { fetchFediverseSearch } from '@/lib/api/client/fediverse'

vi.mock(import('@/lib/api/client/search'), () => ({
  fetchCombinedSearch: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/fediverse'), () => ({
  fetchFediverseSearch: vi.fn<VitestLooseMock>(),
}))

const mockFetchCombinedSearch = vi.mocked(fetchCombinedSearch)
const mockFetchFediverseSearch = vi.mocked(fetchFediverseSearch)

function SearchEffectProbe() {
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  useSearchEffect('fast', 'all', true, true, setResults, setLoading)
  return (
    <>
      <div data-testid='loading'>{String(loading)}</div>
      <div data-testid='topics'>{results.topics.map(topic => topic.name).join(',')}</div>
      <div data-testid='fediverse'>{results.fediverse.map(item => item.title).join(',')}</div>
    </>
  )
}

function makeTopic(id: string, name: string): SearchResults['topics'][number] {
  return {
    __entity_type: 'topic',
    id,
    name,
    slug: id,
    markdown: '',
    aliases: [],
    topic_type: 'topic',
    noindex: false,
    allow_reviews: true,
    created_at: '2026-01-01T00:00:00.000Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'user-1', username: 'user' },
    updated_by: { id: 'user-1', username: 'user' },
  }
}

function makeFediverseResult(
  title: string,
): Awaited<ReturnType<typeof fetchFediverseSearch>>['buckets'][number]['items'][number] {
  return {
    provider: 'peertube',
    result_type: 'video',
    source_hostname: 'videos.example',
    external_url: 'https://videos.example/watch/1',
    title,
    summary: '',
    author_name: null,
    author_url: null,
    published_at: null,
  }
}

describe('useSearchEffect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders combined search results before delayed Fediverse results', async () => {
    let resolveFediverse:
      | ((value: Awaited<ReturnType<typeof fetchFediverseSearch>>) => void)
      | undefined
    const fediversePromise = new Promise<Awaited<ReturnType<typeof fetchFediverseSearch>>>(
      resolve => {
        resolveFediverse = resolve
      },
    )
    mockFetchCombinedSearch.mockResolvedValueOnce({
      ...EMPTY_RESULTS,
      topics: [makeTopic('topic-fast', 'Fast Topic')],
    })
    mockFetchFediverseSearch.mockReturnValueOnce(fediversePromise)

    render(<SearchEffectProbe />)

    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('topics')).toHaveTextContent('Fast Topic')
    expect(screen.getByTestId('fediverse')).toHaveTextContent('')

    await act(async () => {
      resolveFediverse?.({
        buckets: [
          { provider: 'peertube', status: 'ok', items: [makeFediverseResult('Slow Video')] },
        ],
      })
      await fediversePromise
    })

    expect(screen.getByTestId('fediverse')).toHaveTextContent('Slow Video')
  })
})
