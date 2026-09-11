import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockCreateReviewDispute, mockOnError } = vi.hoisted(() => ({
  mockCreateReviewDispute: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/disputes'), () => ({
  createReviewDispute: mockCreateReviewDispute,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: mockOnError }))

import { DisputeReviewButton } from './dispute-review-button'

describe('DisputeReviewButton', () => {
  it('renders the button', () => {
    render(
      <DisputeReviewButton
        postId='post-1'
        topicId='topic-1'
      />,
    )
    expect(screen.getByRole('button', { name: /dispute this review/i })).toBeInTheDocument()
  })

  it('opens the dialog when button is clicked', () => {
    render(
      <DisputeReviewButton
        postId='post-1'
        topicId='topic-1'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /dispute this review/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /dispute this review/i })).toBeInTheDocument()
  })

  it('has data-pw attribute on the button', () => {
    const { container } = render(
      <DisputeReviewButton
        postId='post-1'
        topicId='topic-1'
      />,
    )
    expect(container.querySelector('[data-pw="dispute-review-button"]')).not.toBeNull()
  })
})
