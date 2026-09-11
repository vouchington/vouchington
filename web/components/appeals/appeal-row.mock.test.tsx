import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppealRow } from './appeal-row'
import type { ModerationAppeal } from '@/types/appeals'

vi.mock(import('@/lib/api/client/appeals'), () => ({
  approveAppeal: vi.fn<VitestLooseMock>(),
  sendAppealResolution: vi.fn<VitestLooseMock>(),
  resolveAppeal: vi.fn<VitestLooseMock>(),
  updateAppealDraft: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: vi.fn<VitestLooseMock>() }))

function makeAppeal(overrides: Partial<ModerationAppeal> = {}): ModerationAppeal {
  return {
    id: 'appeal-1',
    user_warning_id: 'warning-1',
    community_ban_id: null,
    post_id: null,
    user_suspension_id: null,
    community_id: null,
    post_removal_kind: null,
    status: 'pending',
    recommended_action: null,
    ai_drafted_at: null,
    ai_public_response: null,
    public_response: null,
    drafted_at: null,
    edited_at: null,
    approved_at: null,
    sent_at: null,
    resolved_at: null,
    resolution_action: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    target_context: null,
    ...overrides,
  }
}

function makeProps(overrides: Partial<Parameters<typeof AppealRow>[0]> = {}) {
  return {
    appeal: makeAppeal(),
    viewerRole: 'administrator' as const,
    disabled: false,
    onEdit: vi.fn<() => void>(),
    onApprove: vi.fn<() => void>(),
    onSend: vi.fn<() => void>(),
    onRerunAI: vi.fn<() => void>(),
    onResolve: vi.fn<() => void>(),
    ...overrides,
  }
}

function renderAppealRow(overrides: Partial<Parameters<typeof AppealRow>[0]> = {}) {
  render(
    <table>
      <tbody>
        <AppealRow {...makeProps(overrides)} />
      </tbody>
    </table>,
  )
}

describe('AppealRow', () => {
  it('renders Community ban for community_ban_id appeals', () => {
    renderAppealRow({
      appeal: makeAppeal({ community_ban_id: 'ban-1', user_warning_id: null }),
    })
    expect(screen.getByText('Community ban')).toBeInTheDocument()
  })

  it('renders Warning for user_warning_id appeals', () => {
    renderAppealRow({ appeal: makeAppeal({ user_warning_id: 'warning-1' }) })
    expect(screen.getByText('Warning')).toBeInTheDocument()
  })

  it('renders Community post removal for community post appeals', () => {
    renderAppealRow({
      appeal: makeAppeal({
        post_id: 'post-1',
        post_removal_kind: 'community',
        user_warning_id: null,
      }),
    })
    expect(screen.getByText('Community post removal')).toBeInTheDocument()
  })

  it('renders Platform post removal for platform post appeals', () => {
    renderAppealRow({
      appeal: makeAppeal({
        post_id: 'post-1',
        post_removal_kind: 'platform',
        user_warning_id: null,
      }),
    })
    expect(screen.getByText('Platform post removal')).toBeInTheDocument()
  })

  it('shows No draft yet when ai_public_response is not set', () => {
    renderAppealRow({ appeal: makeAppeal({ ai_public_response: null }) })
    expect(screen.getByText('No draft yet')).toBeInTheDocument()
  })

  it('shows AI draft text when ai_public_response is set', () => {
    renderAppealRow({
      appeal: makeAppeal({
        ai_public_response: 'AI generated draft response.',
        recommended_action: 'deny',
      }),
    })
    expect(screen.getByText('AI generated draft response.')).toBeInTheDocument()
  })

  it('calls onApprove when Approve is clicked', () => {
    const onApprove = vi.fn<() => void>()
    renderAppealRow({
      appeal: makeAppeal({ public_response: 'Draft text', approved_at: null }),
      onApprove,
    })
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledWith('appeal-1')
  })

  it('calls onSend when Send is clicked', () => {
    const onSend = vi.fn<() => void>()
    renderAppealRow({
      appeal: makeAppeal({
        approved_at: '2026-01-02T00:00:00Z',
        public_response: 'Draft text',
        sent_at: null,
      }),
      onSend,
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('appeal-1')
  })

  it('calls onRerunAI when Re-run AI is clicked', () => {
    const onRerunAI = vi.fn<() => void>()
    renderAppealRow({ onRerunAI })
    fireEvent.click(screen.getByTitle('Re-run AI'))
    expect(onRerunAI).toHaveBeenCalledWith('appeal-1')
  })

  it.each([
    ['approved', { approved_at: '2026-01-02T00:00:00Z' }],
    ['sent', { sent_at: '2026-01-02T00:00:00Z' }],
  ])('disables Re-run AI after the appeal is %s', (_state, appealOverrides) => {
    renderAppealRow({ appeal: makeAppeal(appealOverrides) })

    expect(screen.getByTitle('Re-run AI')).toBeDisabled()
  })

  it('calls onResolve with accept when Accept is clicked', () => {
    const onResolve = vi.fn<() => void>()
    renderAppealRow({
      appeal: makeAppeal({ sent_at: '2026-01-02T00:00:00Z' }),
      onResolve,
    })
    fireEvent.click(screen.getByRole('button', { name: /accept/i }))
    expect(onResolve).toHaveBeenCalledWith('appeal-1', 'accept')
  })

  it('calls onResolve with reduce when Reduce is clicked', () => {
    const onResolve = vi.fn<() => void>()
    renderAppealRow({
      appeal: makeAppeal({ sent_at: '2026-01-02T00:00:00Z' }),
      onResolve,
    })
    fireEvent.click(screen.getByRole('button', { name: /reduce/i }))
    expect(onResolve).toHaveBeenCalledWith('appeal-1', 'reduce')
  })

  it('calls onResolve with deny when Deny is clicked', () => {
    const onResolve = vi.fn<() => void>()
    renderAppealRow({
      appeal: makeAppeal({ sent_at: '2026-01-02T00:00:00Z' }),
      onResolve,
    })
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    expect(onResolve).toHaveBeenCalledWith('appeal-1', 'deny')
  })

  it('disables every resolution control before delivery', () => {
    render(
      <table>
        <tbody>
          <AppealRow {...makeProps({ appeal: makeAppeal({ sent_at: null }) })} />
        </tbody>
      </table>,
    )

    expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reduce/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeDisabled()
  })

  it('enables every resolution control after delivery', () => {
    render(
      <table>
        <tbody>
          <AppealRow
            {...makeProps({
              appeal: makeAppeal({ sent_at: '2026-01-02T00:00:00Z' }),
            })}
          />
        </tbody>
      </table>,
    )

    expect(screen.getByRole('button', { name: /accept/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /reduce/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeEnabled()
  })

  it('keeps every staff action disabled for members', () => {
    renderAppealRow({
      appeal: makeAppeal({ public_response: 'Draft', sent_at: '2026-01-02T00:00:00Z' }),
      viewerRole: 'member',
    })

    expect(screen.getByTitle('Re-run AI')).toBeDisabled()
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reduce/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeDisabled()
  })

  it('allows moderators to resolve non-suspension appeals but not accept suspensions', () => {
    const { rerender } = render(
      <table>
        <tbody>
          <AppealRow
            {...makeProps({
              appeal: makeAppeal({ sent_at: '2026-01-02T00:00:00Z' }),
              viewerRole: 'moderator',
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('button', { name: /accept/i })).toBeEnabled()

    rerender(
      <table>
        <tbody>
          <AppealRow
            {...makeProps({
              appeal: makeAppeal({
                sent_at: '2026-01-02T00:00:00Z',
                user_suspension_id: 'suspension-1',
              }),
              viewerRole: 'moderator',
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reduce/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeEnabled()
  })

  it('has data-pw attribute', () => {
    const { container } = render(
      <table>
        <tbody>
          <AppealRow {...makeProps()} />
        </tbody>
      </table>,
    )
    expect(container.querySelector('[data-pw="appeal-row"]')).not.toBeNull()
  })
})
