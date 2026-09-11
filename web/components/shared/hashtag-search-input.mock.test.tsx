import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HashtagSearchInput } from './hashtag-search-input'

const { mockFetchTopics } = vi.hoisted(() => ({
  mockFetchTopics: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopics: mockFetchTopics,
}))

describe('HashtagSearchInput', () => {
  beforeEach(() => {
    mockFetchTopics.mockReset()
    mockFetchTopics.mockResolvedValue({
      results: [{ id: 'topic-1' }],
      topics: {
        'topic-1': { id: 'topic-1', name: 'Credit Cards', slug: 'credit-cards' },
      },
    })
  })

  it('updates value through onValueChange', () => {
    const onValueChange = vi.fn<(value: string) => void>()
    render(
      <HashtagSearchInput
        value=''
        onValueChange={onValueChange}
        aria-label='Search'
      />,
    )

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cashback' } })

    expect(onValueChange).toHaveBeenCalledWith('cashback')
  })

  it('appends the active hashtag suggestion when Enter is pressed', async () => {
    const onValueChange = vi.fn<(value: string) => void>()
    render(
      <HashtagSearchInput
        value='cashback #cred'
        onValueChange={onValueChange}
        aria-label='Search'
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-pw="hashtag-topic-search-option"]')).toBeTruthy(),
    )
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' })

    expect(onValueChange).toHaveBeenCalledWith('cashback #credit-cards ')
  })

  it('supports keyboard navigation and dismissal for hashtag suggestions', async () => {
    mockFetchTopics.mockResolvedValue({
      results: [{ id: 'topic-1' }, { id: 'topic-2' }],
      topics: {
        'topic-1': { id: 'topic-1', name: 'Credit Cards', slug: 'credit-cards' },
        'topic-2': { id: 'topic-2', name: 'Travel', slug: 'travel' },
      },
    })
    render(
      <HashtagSearchInput
        value='cashback #c'
        onValueChange={vi.fn<(value: string) => void>()}
        aria-label='Search'
      />,
    )

    await waitFor(() =>
      expect(document.querySelectorAll('[data-pw="hashtag-topic-search-option"]')).toHaveLength(2),
    )
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'ArrowUp' })
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Escape' })

    expect(document.querySelector('[data-pw="hashtag-topic-search-option"]')).toBeNull()
  })

  it('clears suggestions when the hashtag fetch fails', async () => {
    mockFetchTopics.mockRejectedValue(new Error('failed'))
    render(
      <HashtagSearchInput
        value='cashback #cred'
        onValueChange={vi.fn<(value: string) => void>()}
        aria-label='Search'
      />,
    )

    await waitFor(() => expect(mockFetchTopics).toHaveBeenCalled())
    expect(document.querySelector('[data-pw="hashtag-topic-search-option"]')).toBeNull()
  })

  it('does not fetch suggestions for an empty hashtag token', () => {
    render(
      <HashtagSearchInput
        value='cashback #'
        onValueChange={vi.fn<(value: string) => void>()}
        aria-label='Search'
      />,
    )

    expect(mockFetchTopics).not.toHaveBeenCalled()
  })

  it('renders as a plain search input when hashtag search is disabled', () => {
    render(
      <HashtagSearchInput
        value='cashback #cred'
        onValueChange={vi.fn<(value: string) => void>()}
        enableHashtagSearch={false}
        aria-label='Search'
      />,
    )

    expect(screen.getByLabelText('Search').getAttribute('role')).toBeNull()
    expect(mockFetchTopics).not.toHaveBeenCalled()
  })

  it('appendTopic always adds trailing space so autocomplete does not reopen', async () => {
    const onValueChange = vi.fn<(value: string) => void>()
    render(
      <HashtagSearchInput
        value='#foo'
        onValueChange={onValueChange}
        aria-label='Search'
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-pw="hashtag-topic-search-option"]')).toBeTruthy(),
    )
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' })

    expect(onValueChange).toHaveBeenCalledWith('#credit-cards ')
  })

  it('normalizes mobile separators before requesting hashtag suggestions', async () => {
    render(
      <HashtagSearchInput
        value='#credit.cards_rewards'
        onValueChange={vi.fn<(value: string) => void>()}
        aria-label='Search'
      />,
    )

    await waitFor(() =>
      expect(mockFetchTopics).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'credit-cards-rewards' }),
      ),
    )
  })

  it('clears stale suggestions before fetching the next hashtag query', async () => {
    const onValueChange = vi.fn<(value: string) => void>()
    const { rerender } = render(
      <HashtagSearchInput
        value='cashback #cred'
        onValueChange={onValueChange}
        aria-label='Search'
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-pw="hashtag-topic-search-option"]')).toBeTruthy(),
    )

    rerender(
      <HashtagSearchInput
        value='cashback #loan'
        onValueChange={onValueChange}
        aria-label='Search'
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-pw="hashtag-topic-search-option"]')).toBeNull(),
    )
  })
})
