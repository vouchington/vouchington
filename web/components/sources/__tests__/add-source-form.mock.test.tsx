import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { mockCreateSource, mockPush, mockTopicHref, mockOnError, mockOnSuccess } = vi.hoisted(
  () => ({
    mockCreateSource: vi.fn<VitestLooseMock>(),
    mockPush: vi.fn<VitestLooseMock>(),
    mockTopicHref: vi.fn<VitestLooseMock>().mockReturnValue('/topics/test-feed'),
    mockOnError: vi.fn<VitestLooseMock>(),
    mockOnSuccess: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/lib/api/client'), () => ({
  createSource: mockCreateSource,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/links/entity-href'), () => ({
  topicHref: mockTopicHref,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

import { AddSourceForm } from '../add-source-form'

describe('AddSourceForm', () => {
  beforeEach(() => {
    mockCreateSource.mockReset()
    mockPush.mockReset()
    mockTopicHref.mockReturnValue('/topics/test-feed')
    mockCreateSource.mockResolvedValue({ topic_slug: 'test-feed' })
  })

  it('renders with correct input label for news kind', () => {
    render(<AddSourceForm kind='news' />)
    expect(screen.getByText('Feed URL')).toBeDefined()
  })

  it('renders with correct input label for podcast kind', () => {
    render(<AddSourceForm kind='podcast' />)
    expect(screen.getByText('Podcast RSS URL')).toBeDefined()
  })

  it('renders with correct input label for video kind', () => {
    render(<AddSourceForm kind='video' />)
    expect(screen.getByText('Channel URL')).toBeDefined()
  })

  it('submit button is disabled when url is empty', () => {
    render(<AddSourceForm kind='news' />)
    const btn = screen.getByRole('button', { name: 'Add News Source' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('calls createSource with rss_feed_url and follow=true on submit', async () => {
    render(<AddSourceForm kind='podcast' />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mockCreateSource).toHaveBeenCalledWith({
        rss_feed_url: 'https://example.com/feed.xml',
        follow: true,
      })
    })
  })

  it('calls onSuccess on successful submit', async () => {
    const onSuccess = vi.fn<VitestLooseMock>()
    render(
      <AddSourceForm
        kind='podcast'
        onSuccess={onSuccess}
      />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it('shows success toast on successful submit', async () => {
    render(<AddSourceForm kind='news' />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith('Source added successfully')
    })
  })

  it('navigates to topic page on success', async () => {
    render(<AddSourceForm kind='news' />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/topics/test-feed')
    })
  })

  it('calls onError with fallback message on submit failure', async () => {
    mockCreateSource.mockRejectedValueOnce(new Error('Network error'))
    render(<AddSourceForm kind='news' />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to add source',
        tags: { form: 'add-source' },
      })
    })
  })
})
