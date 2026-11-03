import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisputeDetail } from './dispute-detail'
import type { ReviewDispute } from '@/types/review-disputes'
import { makeDispute } from '@/test-helpers/disputes-client-fixtures'

function renderDetail(dispute: ReviewDispute, disabled = false) {
  const handlers = {
    onEdit: vi.fn<() => void>(),
    onApprove: vi.fn<() => void>(),
    onSend: vi.fn<() => void>(),
    onRerunAI: vi.fn<() => void>(),
    onResolve: vi.fn<() => void>(),
    onAnnotate: vi.fn<() => void>(),
  }
  render(
    <DisputeDetail
      dispute={dispute}
      disabled={disabled}
      {...handlers}
    />,
  )
}

describe('DisputeDetail', () => {
  it('shows the claim, review preview, topic and rating that rows leave out', () => {
    renderDetail(
      makeDispute({
        claim_text: 'The published terms are inaccurate.',
        staff_context: {
          disputant: {
            id: 'u',
            username: 'c',
            verified_display_name: null,
            profile_image_id: null,
          },
          review: {
            post: {
              id: 'post-1',
              title: 't',
              declared_language: null,
              lingua_rs_detected_language: null,
              slug: 'a-review',
              markdown_preview: 'The review being disputed.',
              created_by_id: null,
              created_at: '2026-01-01T00:00:00Z',
            },
            topic: { id: 'topic-1', name: 'Acme', slug: 'acme', topic_type: 'business' },
            rating: 2,
          },
        },
      }),
    )
    expect(screen.getByText('The published terms are inaccurate.')).toBeInTheDocument()
    expect(screen.getByText('The review being disputed.')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  it('shows the AI draft and its recommended action', () => {
    renderDetail(makeDispute({ ai_public_response: 'Draft text', recommended_action: 'remove' }))
    expect(screen.getByText('Draft text')).toBeInTheDocument()
    expect(screen.getByText(/remove/)).toBeInTheDocument()
  })

  it('shows action buttons for a pending dispute', () => {
    renderDetail(makeDispute())
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('approve button is disabled when public_response is empty', () => {
    renderDetail(makeDispute({ public_response: null }))
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
  })

  it('approve button is enabled when public_response is present and not yet approved', () => {
    renderDetail(makeDispute({ public_response: 'Response text', approved_at: null }))
    expect(screen.getByRole('button', { name: /approve/i })).not.toBeDisabled()
  })

  it('send button is disabled when not approved', () => {
    renderDetail(makeDispute())
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('send button is enabled when approved_at is set and not yet sent', () => {
    renderDetail(
      makeDispute({
        approved_at: '2026-01-02T00:00:00Z',
        sent_at: null,
        public_response: 'Response text',
      }),
    )
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled()
  })

  it('hides action buttons for a resolved dispute', () => {
    renderDetail(makeDispute({ status: 'resolved' }))
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('all buttons are disabled when disabled prop is true', () => {
    renderDetail(makeDispute(), true)
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled()
    }
  })
})
