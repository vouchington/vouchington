import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppealDetail } from './appeal-detail'
import type { ModerationAppeal } from '@/types/appeals'
import { makeAppeal } from '@/test-helpers/appeals-client-fixtures'

function makeProps(
  overrides: Partial<Parameters<typeof AppealDetail>[0]> = {},
): Parameters<typeof AppealDetail>[0] {
  return {
    appeal: makeAppeal({ public_response: null }),
    viewerRole: 'administrator',
    disabled: false,
    onEdit: vi.fn<() => void>(),
    onApprove: vi.fn<() => void>(),
    onSend: vi.fn<() => void>(),
    onRerunAI: vi.fn<() => void>(),
    onResolve: vi.fn<() => void>(),
    ...overrides,
  }
}

function renderDetail(overrides: Partial<Parameters<typeof AppealDetail>[0]> = {}) {
  render(<AppealDetail {...makeProps(overrides)} />)
}

function appealWith(overrides: Partial<ModerationAppeal>) {
  return makeAppeal({ public_response: null, ...overrides })
}

describe('AppealDetail', () => {
  it('shows the appeal reason and original decision that rows leave out', () => {
    renderDetail({
      appeal: appealWith({
        appeal_reason: 'I did not violate any rules.',
        staff_context: {
          appellant: {
            id: 'u',
            username: 'm',
            verified_display_name: null,
            profile_image_id: null,
          },
          original_decision: {
            internal_reason: 'Repeated unsupported claims.',
            actor: {
              id: 's',
              username: 'moderator',
              verified_display_name: null,
              profile_image_id: null,
            },
          },
        },
      }),
    })
    expect(screen.getByText('I did not violate any rules.')).toBeInTheDocument()
    expect(screen.getByText('Repeated unsupported claims.')).toBeInTheDocument()
    expect(screen.getByText('moderator')).toBeInTheDocument()
  })

  it('shows No draft yet when ai_public_response is not set', () => {
    renderDetail({ appeal: appealWith({ ai_public_response: null }) })
    expect(screen.getByText('No draft yet')).toBeInTheDocument()
  })

  it('shows AI draft text when ai_public_response is set', () => {
    renderDetail({
      appeal: appealWith({
        ai_public_response: 'AI generated draft response.',
        recommended_action: 'deny',
      }),
    })
    expect(screen.getByText('AI generated draft response.')).toBeInTheDocument()
  })

  it('calls onApprove when Approve is clicked', () => {
    const onApprove = vi.fn<() => void>()
    renderDetail({
      appeal: appealWith({ public_response: 'Draft text', approved_at: null }),
      onApprove,
    })
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledWith('appeal-1')
  })

  it('calls onSend when Send is clicked', () => {
    const onSend = vi.fn<() => void>()
    renderDetail({
      appeal: appealWith({
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
    renderDetail({ onRerunAI })
    fireEvent.click(screen.getByTitle('Re-run AI'))
    expect(onRerunAI).toHaveBeenCalledWith('appeal-1')
  })

  it.each([
    ['approved', { approved_at: '2026-01-02T00:00:00Z' }],
    ['sent', { sent_at: '2026-01-02T00:00:00Z' }],
  ])('disables Re-run AI after the appeal is %s', (_state, appealOverrides) => {
    renderDetail({ appeal: appealWith(appealOverrides) })

    expect(screen.getByTitle('Re-run AI')).toBeDisabled()
  })

  it.each([
    ['accept', /accept/i],
    ['reduce', /reduce/i],
    ['deny', /deny/i],
  ] as const)('calls onResolve with %s when its button is clicked', (action, name) => {
    const onResolve = vi.fn<() => void>()
    renderDetail({ appeal: appealWith({ sent_at: '2026-01-02T00:00:00Z' }), onResolve })
    fireEvent.click(screen.getByRole('button', { name }))
    expect(onResolve).toHaveBeenCalledWith('appeal-1', action)
  })

  it('disables every resolution control before delivery', () => {
    renderDetail({ appeal: appealWith({ sent_at: null }) })

    expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reduce/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeDisabled()
  })

  it('enables every resolution control after delivery', () => {
    renderDetail({ appeal: appealWith({ sent_at: '2026-01-02T00:00:00Z' }) })

    expect(screen.getByRole('button', { name: /accept/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /reduce/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeEnabled()
  })

  it('keeps every staff action disabled for members', () => {
    renderDetail({
      appeal: appealWith({ public_response: 'Draft', sent_at: '2026-01-02T00:00:00Z' }),
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
      <AppealDetail
        {...makeProps({
          appeal: appealWith({ sent_at: '2026-01-02T00:00:00Z' }),
          viewerRole: 'moderator',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /accept/i })).toBeEnabled()

    rerender(
      <AppealDetail
        {...makeProps({
          appeal: appealWith({
            sent_at: '2026-01-02T00:00:00Z',
            user_suspension_id: 'suspension-1',
          }),
          viewerRole: 'moderator',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reduce/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /deny/i })).toBeEnabled()
  })
})
