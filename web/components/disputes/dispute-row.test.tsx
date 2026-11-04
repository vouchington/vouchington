import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DisputeRow } from './dispute-row'
import type { ReviewDisputeSummary } from '@/types/review-disputes'

function makeSummary(overrides: Partial<ReviewDisputeSummary> = {}): ReviewDisputeSummary {
  return {
    id: 'dispute-1',
    post_id: 'post-1',
    post_label: 'A review',
    topic_id: 'topic-1',
    reason: 'factually_inaccurate',
    status: 'pending',
    post_content: { text: 'A Review', declared_language: null, lingua_rs_detected_language: null },
    created_at: '2026-01-01T00:00:00Z',
    public_response: null,
    approved_at: null,
    sent_at: null,
    has_ai_draft: false,
    has_draft: false,
    ...overrides,
  }
}

function renderRow(overrides: Partial<Parameters<typeof DisputeRow>[0]> = {}) {
  const onOpen = vi.fn<(id: string) => void>()
  const view = render(
    <table>
      <tbody>
        <DisputeRow
          dispute={makeSummary()}
          disabled={false}
          onOpen={onOpen}
          {...overrides}
        />
      </tbody>
    </table>,
  )
  return { ...view, onOpen }
}

describe('DisputeRow', () => {
  it('renders the summary cells', () => {
    renderRow()
    expect(screen.getByText('A Review')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'A Review' })).toBeNull()
    expect(screen.getByText('factually inaccurate')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('links the review and names the disputant from summary fields', () => {
    renderRow({
      dispute: makeSummary({
        post_slug: 'a-review',
        disputant: {
          id: 'user-1',
          username: 'claimant',
          verified_display_name: 'Claimant Name',
          profile_image_id: null,
        },
      }),
    })
    expect(screen.getByRole('link', { name: 'A Review' })).toHaveAttribute(
      'href',
      '/review/a-review',
    )
    expect(screen.getByText('Claimant Name')).toBeInTheDocument()
  })

  it('flags whether an AI draft exists without loading it', () => {
    renderRow({ dispute: makeSummary({ has_ai_draft: true, recommended_action: 'remove' }) })
    expect(screen.getByText(/remove/)).toBeInTheDocument()
  })

  it('shows a response only when the summary carries one', () => {
    renderRow({ dispute: makeSummary({ public_response: 'Sent text', sent_at: '2026-01-03' }) })
    expect(screen.getByText('Sent text')).toBeInTheDocument()
  })

  it('opens the dispute by id and offers no draft or resolution actions', () => {
    const { onOpen } = renderRow()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(onOpen).toHaveBeenCalledWith('dispute-1')
  })

  it('disables the open button while a request is in flight', () => {
    renderRow({ disabled: true })
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled()
  })

  it('has data-pw attribute', () => {
    const { container } = renderRow()
    expect(container.querySelector('[data-pw="dispute-row"]')).not.toBeNull()
  })
})
