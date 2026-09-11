import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockCreateTopicClaim, mockOnError } = vi.hoisted(() => ({
  mockCreateTopicClaim: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topic-claims'), () => ({
  createTopicClaim: mockCreateTopicClaim,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: mockOnError }))

import { ClaimTopicForm } from './claim-topic-form'

describe('ClaimTopicForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the role input and submit button', () => {
    render(
      <ClaimTopicForm
        topicIdOrSlug='my-topic'
        onSuccess={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByLabelText(/your role/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /claim this topic/i })).toBeInTheDocument()
  })

  it('submit button is disabled when role is empty', () => {
    render(
      <ClaimTopicForm
        topicIdOrSlug='my-topic'
        onSuccess={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByRole('button', { name: /claim this topic/i })).toBeDisabled()
  })

  it('submit button is enabled when role is filled', () => {
    render(
      <ClaimTopicForm
        topicIdOrSlug='my-topic'
        onSuccess={vi.fn<() => void>()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/your role/i), { target: { value: 'Card issuer' } })
    expect(screen.getByRole('button', { name: /claim this topic/i })).not.toBeDisabled()
  })

  it('calls createTopicClaim with correct args on submit', async () => {
    const onSuccess = vi.fn<() => void>()
    mockCreateTopicClaim.mockResolvedValueOnce({ claim: { id: 'claim-1' }, is_duplicate: false })

    render(
      <ClaimTopicForm
        topicIdOrSlug='my-topic'
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByLabelText(/your role/i), { target: { value: 'Card issuer' } })
    fireEvent.submit(screen.getByRole('button', { name: /claim this topic/i }).closest('form')!)

    await waitFor(() =>
      expect(mockCreateTopicClaim).toHaveBeenCalledWith('my-topic', {
        claimed_role: 'Card issuer',
      }),
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('claim-1'))
  })

  it('routes errors through onError on failure', async () => {
    const error = new Error('Failed')
    mockCreateTopicClaim.mockRejectedValueOnce(error)
    const onSuccess = vi.fn<() => void>()

    render(
      <ClaimTopicForm
        topicIdOrSlug='my-topic'
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByLabelText(/your role/i), { target: { value: 'Card issuer' } })
    fireEvent.submit(screen.getByRole('button', { name: /claim this topic/i }).closest('form')!)

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ fallback: 'An error occurred' }),
      ),
    )
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows error message on failure', async () => {
    const error = new Error('Server error')
    mockCreateTopicClaim.mockRejectedValueOnce(error)

    render(
      <ClaimTopicForm
        topicIdOrSlug='my-topic'
        onSuccess={vi.fn<() => void>()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/your role/i), { target: { value: 'Card issuer' } })
    fireEvent.submit(screen.getByRole('button', { name: /claim this topic/i }).closest('form')!)

    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument())
  })

  it('has data-pw attributes', () => {
    const { container } = render(
      <ClaimTopicForm
        topicIdOrSlug='my-topic'
        onSuccess={vi.fn<() => void>()}
      />,
    )
    expect(container.querySelector('[data-pw="claim-topic-form"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="claim-submit"]')).not.toBeNull()
  })
})
