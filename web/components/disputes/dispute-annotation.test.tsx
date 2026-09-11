import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisputeAnnotation } from './dispute-annotation'

function makeAnnotation(
  overrides: Partial<Parameters<typeof DisputeAnnotation>[0]['annotation']> = {},
) {
  return {
    id: 'ann-1',
    post_id: 'post-1',
    review_dispute_id: 'dispute-1',
    body_text: 'This review is factually wrong.',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('DisputeAnnotation', () => {
  it('renders the annotation body text', () => {
    render(<DisputeAnnotation annotation={makeAnnotation()} />)
    expect(screen.getByText('This review is factually wrong.')).toBeInTheDocument()
  })

  it('renders the label and moderator note', () => {
    render(<DisputeAnnotation annotation={makeAnnotation()} />)
    expect(screen.getByText('Statement from the reviewed party')).toBeInTheDocument()
    expect(screen.getByText('Reviewed and approved by Voucha moderators.')).toBeInTheDocument()
  })

  it('has data-pw attribute', () => {
    const { container } = render(<DisputeAnnotation annotation={makeAnnotation()} />)
    expect(container.querySelector('[data-pw="dispute-annotation"]')).not.toBeNull()
  })
})
