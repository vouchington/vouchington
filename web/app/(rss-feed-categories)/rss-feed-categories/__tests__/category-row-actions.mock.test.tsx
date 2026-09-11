import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const mockRefresh = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

const mockReject = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue(undefined))
const mockUnreject = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue(undefined))
const mockAssign = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue({ updated: 3 }))

vi.mock(import('@/lib/api/client/rss-feed-categories'), () => ({
  rejectRssFeedCategory: mockReject,
  unrejectRssFeedCategory: mockUnreject,
  assignRssFeedCategory: mockAssign,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ onChange }: { onChange: (id: string, name: string) => void }) => (
    <button
      type='button'
      data-testid='mock-topic-autocomplete'
      onClick={() => onChange('topic-id-1', 'Test Topic')}
    >
      Assign
    </button>
  ),
}))

import { CategoryRowActions } from '../category-row-actions'
import onError from '@/lib/on-error'

const mockOnError = vi.mocked(onError)

const pendingCategory = { category_text: 'credit-cards', item_count: 5, rejected: false }
const rejectedCategory = { category_text: 'news', item_count: 10, rejected: true }

describe('CategoryRowActions', () => {
  it('shows reject button for pending category', () => {
    render(<CategoryRowActions category={pendingCategory} />)
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('calls rejectRssFeedCategory on reject click', async () => {
    render(<CategoryRowActions category={pendingCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(mockReject).toHaveBeenCalledWith('credit-cards'))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows unreject button for rejected category', () => {
    render(<CategoryRowActions category={rejectedCategory} />)
    expect(screen.getByRole('button', { name: 'Un-reject' })).toBeInTheDocument()
  })

  it('calls unrejectRssFeedCategory on unreject click', async () => {
    render(<CategoryRowActions category={rejectedCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Un-reject' }))
    await waitFor(() => expect(mockUnreject).toHaveBeenCalledWith('news'))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('calls assignRssFeedCategory on topic selection', async () => {
    render(<CategoryRowActions category={pendingCategory} />)
    fireEvent.click(screen.getByTestId('mock-topic-autocomplete'))
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith('credit-cards', 'topic-id-1'))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('create topic link has correct href with name and slug', () => {
    render(<CategoryRowActions category={pendingCategory} />)
    const link = screen.getByRole('link', { name: 'Create topic' })
    expect(link).toHaveAttribute('href', expect.stringContaining('name=Credit%20Cards'))
    expect(link).toHaveAttribute('href', expect.stringContaining('slug=credit-cards'))
  })

  it('does not show reject button for rejected category', () => {
    render(<CategoryRowActions category={rejectedCategory} />)
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('does not show unreject button for pending category', () => {
    render(<CategoryRowActions category={pendingCategory} />)
    expect(screen.queryByRole('button', { name: 'Un-reject' })).not.toBeInTheDocument()
  })

  it('calls onError and re-enables button when reject fails', async () => {
    mockReject.mockRejectedValueOnce(new Error('Network error'))
    render(<CategoryRowActions category={pendingCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Reject' })).not.toBeDisabled()
  })

  it('calls onError and re-enables button when unreject fails', async () => {
    mockUnreject.mockRejectedValueOnce(new Error('Network error'))
    render(<CategoryRowActions category={rejectedCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Un-reject' }))
    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Un-reject' })).not.toBeDisabled()
  })

  it('calls onError when assign fails', async () => {
    mockAssign.mockRejectedValueOnce(new Error('Network error'))
    render(<CategoryRowActions category={pendingCategory} />)
    fireEvent.click(screen.getByTestId('mock-topic-autocomplete'))
    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
  })
})
