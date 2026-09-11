import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisputeStatusCard } from './dispute-status-card'
import type { ReviewDispute } from '@/types/review-disputes'

function makeDispute(overrides: Partial<ReviewDispute> = {}): ReviewDispute {
  return {
    id: 'dispute-1',
    post_id: 'post-1',
    topic_id: 'topic-1',
    reason: 'factually_inaccurate',
    status: 'pending',
    post_content: { text: 'My Review', declared_language: null, lingua_rs_detected_language: null },
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('DisputeStatusCard', () => {
  it('renders the target content as a link', () => {
    render(<DisputeStatusCard dispute={makeDispute()} />)
    const link = screen.getByRole('link', { name: 'My Review' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/review/post-1')
  })

  it('renders the post identifier when target content is unavailable', () => {
    render(<DisputeStatusCard dispute={makeDispute({ post_content: null })} />)
    expect(screen.getByText('post-1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My Review' })).not.toBeInTheDocument()
  })

  it('renders the status badge', () => {
    render(<DisputeStatusCard dispute={makeDispute({ status: 'resolved' })} />)
    expect(screen.getByText('resolved')).toBeInTheDocument()
  })

  it('shows moderator response when sent_at and public_response are present', () => {
    render(
      <DisputeStatusCard
        dispute={makeDispute({
          sent_at: '2026-01-02T00:00:00Z',
          public_response: 'We have reviewed your dispute.',
          status: 'resolved',
        })}
      />,
    )
    expect(screen.getByText('We have reviewed your dispute.')).toBeInTheDocument()
    expect(screen.getByText('Moderator response:')).toBeInTheDocument()
  })

  it('does not show moderator response when sent_at is absent', () => {
    render(
      <DisputeStatusCard
        dispute={makeDispute({ public_response: 'Some response', sent_at: undefined })}
      />,
    )
    expect(screen.queryByText('Moderator response:')).not.toBeInTheDocument()
  })

  it('has data-pw attribute', () => {
    const { container } = render(<DisputeStatusCard dispute={makeDispute()} />)
    expect(container.querySelector('[data-pw="dispute-status-card"]')).not.toBeNull()
  })
})
