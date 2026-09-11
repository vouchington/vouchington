import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchTopHashtagsMock, linkTopicAliasMock, onErrorMock, unlinkTopicAliasMock } = vi.hoisted(
  () => ({
    fetchTopHashtagsMock: vi.fn<VitestLooseMock>(),
    linkTopicAliasMock: vi.fn<VitestLooseMock>(),
    onErrorMock: vi.fn<VitestLooseMock>(),
    unlinkTopicAliasMock: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/lib/api/client/topic-recommendations'), () => ({
  fetchTopHashtags: fetchTopHashtagsMock,
}))
vi.mock(import('@/lib/api/client/topics'), () => ({
  linkTopicAlias: linkTopicAliasMock,
  unlinkTopicAlias: unlinkTopicAliasMock,
}))
vi.mock(import('@/lib/on-error'), () => ({ default: onErrorMock }))
vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({
    clearOnTextEdit,
    onChange,
  }: {
    clearOnTextEdit?: boolean
    onChange: (id: string, name: string) => void
  }) => (
    <>
      <button
        type='button'
        onClick={() => onChange('topic-2', 'Banking')}
      >
        Choose Banking
      </button>
      {clearOnTextEdit ? (
        <button
          type='button'
          onClick={() => onChange('', 'Banking')}
        >
          Edit topic text
        </button>
      ) : null}
    </>
  ),
}))

import { TopHashtags } from './top-hashtags'

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
  results: [
    {
      ...initialData.results[0]!,
      topic_alias_id: 'alias-unlinked',
      topic_id: null,
    },
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(innerResolve => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe('TopHashtags errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the linked topic beside its unlink control', () => {
    render(
      <TopHashtags
        initialData={initialData}
        isAdmin
      />,
    )

    const linkedTopic = screen.getByRole('link', { name: 'Travel' })
    const unlink = screen.getByRole('button', { name: 'Unlink' })
    expect(linkedTopic).toHaveAttribute('href', '/topic/travel')
    expect(linkedTopic.parentElement).toContainElement(unlink)
  })

  it('shows the linked topic to non-administrators', () => {
    render(
      <TopHashtags
        initialData={initialData}
        isAdmin={false}
      />,
    )

    expect(screen.getByRole('link', { name: 'Travel' })).toHaveAttribute('href', '/topic/travel')
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument()
  })

  it('reports search failures instead of silently swallowing them', async () => {
    const error = new Error('offline')
    fetchTopHashtagsMock.mockRejectedValueOnce(error)
    render(
      <TopHashtags
        initialData={initialData}
        isAdmin
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() => expect(onErrorMock).toHaveBeenCalledWith(error, expect.any(Object)))
  })

  it('keeps newer search results when an earlier search resolves last', async () => {
    const firstSearch = deferred<typeof initialData>()
    const secondSearch = deferred<typeof initialData>()
    fetchTopHashtagsMock
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise)
    render(
      <TopHashtags
        initialData={initialData}
        isAdmin
      />,
    )

    const search = screen.getByRole('textbox', { name: 'Search hashtags' })
    fireEvent.change(search, { target: { value: 'first' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    fireEvent.change(search, { target: { value: 'second' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    await act(async () => {
      secondSearch.resolve({
        ...initialData,
        results: [{ ...initialData.results[0]!, hashtag: '#Second' }],
      })
    })
    expect(screen.getByText('#Second')).toBeInTheDocument()

    await act(async () => {
      firstSearch.resolve({
        ...initialData,
        results: [{ ...initialData.results[0]!, hashtag: '#First' }],
      })
    })

    expect(screen.getByText('#Second')).toBeInTheDocument()
    expect(screen.queryByText('#First')).not.toBeInTheDocument()
  })

  it('reports unlink failures instead of leaving the stale result unexplained', async () => {
    const error = new Error('conflict')
    unlinkTopicAliasMock.mockRejectedValueOnce(error)
    render(
      <TopHashtags
        initialData={initialData}
        isAdmin
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))

    await waitFor(() => expect(onErrorMock).toHaveBeenCalledWith(error, expect.any(Object)))
  })

  it('reports link failures instead of dismissing the selected topic', async () => {
    const error = new Error('conflict')
    linkTopicAliasMock.mockRejectedValueOnce(error)
    render(
      <TopHashtags
        initialData={unlinkedData}
        isAdmin
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Link Topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Banking' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Link Topic' }).at(-1)!)

    await waitFor(() => expect(onErrorMock).toHaveBeenCalledWith(error, expect.any(Object)))
  })

  it('clears a selected topic when cancelling or linking a different hashtag', () => {
    render(
      <TopHashtags
        initialData={{
          ...unlinkedData,
          results: [
            unlinkedData.results[0]!,
            { ...unlinkedData.results[0]!, topic_alias_id: 'another-alias', hashtag: '#Another' },
          ],
        }}
        isAdmin
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Link Topic' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Choose Banking' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Link Topic' })[1]!)

    expect(screen.getAllByRole('button', { name: 'Link Topic' }).at(-1)).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Link Topic' })[0]!)

    expect(screen.getAllByRole('button', { name: 'Link Topic' }).at(-1)).toBeDisabled()
  })

  it('clears the selected topic when its autocomplete text is edited', () => {
    render(
      <TopHashtags
        initialData={unlinkedData}
        isAdmin
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Link Topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Banking' }))
    expect(screen.getAllByRole('button', { name: 'Link Topic' }).at(-1)).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Edit topic text' }))

    expect(screen.getAllByRole('button', { name: 'Link Topic' }).at(-1)).toBeDisabled()
  })

  it('reports load-more failures and retains the current page', async () => {
    const error = new Error('offline')
    fetchTopHashtagsMock.mockRejectedValueOnce(error)
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

    await waitFor(() => expect(onErrorMock).toHaveBeenCalledWith(error, expect.any(Object)))
    expect(screen.getByText('#TravelTips')).toBeInTheDocument()
  })

  it('deduplicates hashtags repeated after a ranking refresh between pages', async () => {
    fetchTopHashtagsMock.mockResolvedValueOnce({
      ...initialData,
      results: [
        initialData.results[0]!,
        {
          ...initialData.results[0]!,
          topic_alias_id: 'alias-new',
          hashtag: '#Banking',
        },
      ],
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

    await waitFor(() => expect(screen.getByText('#Banking')).toBeInTheDocument())
    expect(screen.getAllByText('#TravelTips')).toHaveLength(1)
  })
})
