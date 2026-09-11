import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisputeRow } from './dispute-row'
import type { ReviewDispute } from '@/types/review-disputes'

function makeDispute(overrides: Partial<ReviewDispute> = {}): ReviewDispute {
  return {
    id: 'dispute-1',
    post_id: 'post-1',
    topic_id: 'topic-1',
    reason: 'factually_inaccurate',
    status: 'pending',
    post_content: { text: 'A Review', declared_language: null, lingua_rs_detected_language: null },
    created_at: '2026-01-01T00:00:00Z',
    public_response: null,
    approved_at: null,
    sent_at: null,
    ...overrides,
  }
}

function makeProps(overrides: Partial<Parameters<typeof DisputeRow>[0]> = {}) {
  return {
    dispute: makeDispute(),
    disabled: false,
    onEdit: vi.fn<() => void>(),
    onApprove: vi.fn<() => void>(),
    onSend: vi.fn<() => void>(),
    onRerunAI: vi.fn<() => void>(),
    onResolve: vi.fn<() => void>(),
    onAnnotate: vi.fn<() => void>(),
    ...overrides,
  }
}

describe('DisputeRow', () => {
  it('renders the dispute row', () => {
    render(
      <table>
        <tbody>
          <DisputeRow {...makeProps()} />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('link', { name: 'A Review' })).toBeInTheDocument()
    expect(screen.getByText('factually inaccurate')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows action buttons for a pending dispute', () => {
    render(
      <table>
        <tbody>
          <DisputeRow {...makeProps()} />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('approve button is disabled when public_response is empty', () => {
    render(
      <table>
        <tbody>
          <DisputeRow {...makeProps({ dispute: makeDispute({ public_response: null }) })} />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
  })

  it('approve button is enabled when public_response is present and not yet approved', () => {
    render(
      <table>
        <tbody>
          <DisputeRow
            {...makeProps({
              dispute: makeDispute({ public_response: 'Response text', approved_at: null }),
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('button', { name: /approve/i })).not.toBeDisabled()
  })

  it('send button is disabled when not approved', () => {
    render(
      <table>
        <tbody>
          <DisputeRow {...makeProps()} />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('send button is enabled when approved_at is set and not yet sent', () => {
    render(
      <table>
        <tbody>
          <DisputeRow
            {...makeProps({
              dispute: makeDispute({
                approved_at: '2026-01-02T00:00:00Z',
                sent_at: null,
                public_response: 'Response text',
              }),
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled()
  })

  it('hides action buttons for a resolved dispute', () => {
    render(
      <table>
        <tbody>
          <DisputeRow {...makeProps({ dispute: makeDispute({ status: 'resolved' }) })} />
        </tbody>
      </table>,
    )
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('all buttons are disabled when disabled prop is true', () => {
    render(
      <table>
        <tbody>
          <DisputeRow {...makeProps({ disabled: true })} />
        </tbody>
      </table>,
    )
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled()
    }
  })

  it('has data-pw attribute', () => {
    const { container } = render(
      <table>
        <tbody>
          <DisputeRow {...makeProps()} />
        </tbody>
      </table>,
    )
    expect(container.querySelector('[data-pw="dispute-row"]')).not.toBeNull()
  })
})
