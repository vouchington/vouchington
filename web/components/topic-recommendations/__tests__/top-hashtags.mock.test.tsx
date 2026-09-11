import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchTopHashtagsMock, linkTopicAliasMock, unlinkTopicAliasMock } = vi.hoisted(() => ({
  fetchTopHashtagsMock: vi.fn<VitestLooseMock>(),
  linkTopicAliasMock: vi.fn<VitestLooseMock>(),
  unlinkTopicAliasMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topic-recommendations'), () => ({
  fetchTopHashtags: fetchTopHashtagsMock,
}))
vi.mock(import('@/lib/api/client/topics'), () => ({
  linkTopicAlias: linkTopicAliasMock,
  unlinkTopicAlias: unlinkTopicAliasMock,
}))
vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ onChange }: { onChange: (id: string, name: string) => void }) => (
    <button
      type='button'
      onClick={() => onChange('topic-2', 'Banking')}
    >
      Choose Banking
    </button>
  ),
}))

import { TopHashtags } from '../top-hashtags'

const initialData = {
  results: [
    {
      topic_alias_id: 'alias-linked',
      hashtag: '#TravelTips',
      item_count: 12,
      contributor_count: 4,
      latest_content_id: 'post-1',
      topic_id: 'topic-1',
    },
  ],
  topics: {
    'topic-1': { id: 'topic-1', name: 'Travel', slug: 'travel', topic_type: 'topic' },
  },
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

const unlinkedData = {
  ...initialData,
  results: [{ ...initialData.results[0]!, topic_alias_id: 'alias-unlinked', topic_id: null }],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(innerResolve => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe('TopHashtags request races', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not offer to unlink a topic current-slug alias', () => {
    render(
      <TopHashtags
        initialData={{
          ...initialData,
          results: [{ ...initialData.results[0]!, hashtag: '#Travel' }],
        }}
        isAdmin
      />,
    )

    expect(screen.getByRole('link', { name: 'Travel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument()
  })

  it('keeps topic sidecars from both pages when appending unique hashtags', async () => {
    fetchTopHashtagsMock.mockResolvedValueOnce({
      results: [
        {
          ...initialData.results[0]!,
          topic_alias_id: 'alias-banking',
          hashtag: '#Banking',
          topic_id: 'topic-2',
        },
      ],
      topics: {
        'topic-2': { id: 'topic-2', name: 'Banking', slug: 'banking', topic_type: 'topic' },
      },
      page_info: { has_next_page: false, start_cursor: 'next', end_cursor: null },
    })
    render(
      <TopHashtags
        initialData={{
          ...initialData,
          page_info: { has_next_page: true, start_cursor: null, end_cursor: 'next' },
        }}
        isAdmin
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('link', { name: 'Banking' })).toHaveAttribute(
      'href',
      '/topic/banking',
    )
    expect(screen.getByRole('link', { name: 'Travel' })).toHaveAttribute('href', '/topic/travel')
  })

  it('loads the next page with submitted filters instead of draft query text', async () => {
    fetchTopHashtagsMock.mockResolvedValueOnce({
      ...initialData,
      page_info: { has_next_page: false, start_cursor: 'next', end_cursor: null },
    })
    render(
      <TopHashtags
        initialData={{
          ...initialData,
          page_info: { has_next_page: true, start_cursor: null, end_cursor: 'next' },
        }}
        isAdmin
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search hashtags' }), {
      target: { value: 'unsubmitted' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() =>
      expect(fetchTopHashtagsMock).toHaveBeenCalledWith({ q: '', mapping: 'all', after: 'next' }),
    )
  })

  it('keeps old filters with the old cursor after a submitted search fails', async () => {
    fetchTopHashtagsMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(initialData)
    render(
      <TopHashtags
        initialData={{
          ...initialData,
          page_info: { has_next_page: true, start_cursor: null, end_cursor: 'next' },
        }}
        isAdmin
      />,
    )

    const search = screen.getByRole('textbox', { name: 'Search hashtags' })
    fireEvent.change(search, { target: { value: 'failed' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    const loadMore = screen.getByRole('button', { name: 'Load more' })
    await waitFor(() => expect(loadMore).toBeEnabled())
    fireEvent.click(loadMore)

    await waitFor(() =>
      expect(fetchTopHashtagsMock).toHaveBeenLastCalledWith({
        q: '',
        mapping: 'all',
        after: 'next',
      }),
    )
  })

  it.each([
    ['unlink', initialData],
    ['link', unlinkedData],
  ] as const)('refreshes with current filters when %s completes', async (mutationKind, data) => {
    const mutation = deferred<void>()
    if (mutationKind === 'unlink') unlinkTopicAliasMock.mockReturnValueOnce(mutation.promise)
    else linkTopicAliasMock.mockReturnValueOnce(mutation.promise)
    fetchTopHashtagsMock.mockResolvedValue(data)
    render(
      <TopHashtags
        initialData={data}
        isAdmin
      />,
    )

    if (mutationKind === 'unlink') {
      fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Link Topic' }))
      fireEvent.click(screen.getByRole('button', { name: 'Choose Banking' }))
      fireEvent.click(screen.getAllByRole('button', { name: 'Link Topic' }).at(-1)!)
    }
    fireEvent.change(screen.getByRole('textbox', { name: 'Search hashtags' }), {
      target: { value: 'fresh' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Linked' }))
    await waitFor(() => expect(fetchTopHashtagsMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      mutation.resolve()
    })

    await waitFor(() =>
      expect(fetchTopHashtagsMock).toHaveBeenLastCalledWith({
        q: 'fresh',
        mapping: 'linked',
        after: undefined,
      }),
    )
  })
})
