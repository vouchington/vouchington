import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReviewDispute } from '@/types/review-disputes'
import { DisputesTable } from './disputes-table'

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

function makeProps(overrides: Partial<Parameters<typeof DisputesTable>[0]> = {}) {
  return {
    viewerTier: 'staff' as const,
    disputes: [makeDispute()],
    draftEdits: {},
    loadingId: null,
    onEdit: vi.fn<() => void>(),
    onApprove: vi.fn<() => void>(),
    onSend: vi.fn<() => void>(),
    onRerunAI: vi.fn<() => void>(),
    onResolve: vi.fn<() => void>(),
    onAnnotate: vi.fn<() => void>(),
    ...overrides,
  }
}

describe('DisputesTable', () => {
  it('renders staff table headers', () => {
    render(<DisputesTable {...makeProps()} />)
    expect(screen.getByText('AI Draft')).toBeInTheDocument()
    expect(screen.getByText('Response')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('renders member table headers (no AI Draft/Response/Actions)', () => {
    render(<DisputesTable {...makeProps({ viewerTier: 'member' })} />)
    expect(screen.queryByText('AI Draft')).not.toBeInTheDocument()
    expect(screen.getByText('Resolution')).toBeInTheDocument()
  })

  it('renders empty message when no disputes', () => {
    render(<DisputesTable {...makeProps({ disputes: [] })} />)
    expect(screen.getByText('No disputes.')).toBeInTheDocument()
  })

  it('renders dispute row for staff tier', () => {
    render(<DisputesTable {...makeProps()} />)
    expect(screen.getByRole('link', { name: 'A Review' })).toBeInTheDocument()
  })

  it('renders member dispute row for member tier', () => {
    const memberDispute: ReviewDispute = {
      id: 'dispute-m1',
      post_id: 'post-m1',
      topic_id: 'topic-m1',
      reason: 'privacy_violation',
      status: 'pending',
      post_content: {
        text: 'Member Review',
        declared_language: null,
        lingua_rs_detected_language: null,
      },
      created_at: '2026-01-01T00:00:00Z',
    }
    render(<DisputesTable {...makeProps({ viewerTier: 'member', disputes: [memberDispute] })} />)
    expect(screen.getByRole('link', { name: 'Member Review' })).toBeInTheDocument()
  })

  it('passes draftEdits override to DisputeRow', () => {
    const props = makeProps({
      disputes: [makeDispute({ id: 'dispute-1', public_response: 'original' })],
      draftEdits: { 'dispute-1': 'draft override' },
    })
    render(<DisputesTable {...props} />)
    const textarea = screen.getByPlaceholderText('Edit the public response...')
    expect((textarea as HTMLTextAreaElement).value).toBe('draft override')
  })

  it('passes onAnnotate through to DisputeRow', () => {
    const onAnnotate = vi.fn<() => void>()
    render(
      <DisputesTable
        {...makeProps({
          disputes: [makeDispute({ public_response: 'some text' })],
          onAnnotate,
        })}
      />,
    )
    const annotateBtn = screen.getByTitle('Attach the response above as a public rebuttal')
    expect(annotateBtn).toBeInTheDocument()
  })
})
