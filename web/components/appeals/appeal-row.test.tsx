import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppealRow } from './appeal-row'
import type { ModerationAppealSummary } from '@/types/appeals'

function makeSummary(overrides: Partial<ModerationAppealSummary> = {}): ModerationAppealSummary {
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
    public_response: null,
    approved_at: null,
    sent_at: null,
    resolved_at: null,
    resolution_action: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    target_context: null,
    has_ai_draft: false,
    has_draft: false,
    ...overrides,
  }
}

function renderAppealRow(overrides: Partial<Parameters<typeof AppealRow>[0]> = {}) {
  const onOpen = vi.fn<(id: string) => void>()
  const view = render(
    <table>
      <tbody>
        <AppealRow
          appeal={makeSummary()}
          disabled={false}
          onOpen={onOpen}
          {...overrides}
        />
      </tbody>
    </table>,
  )
  return { ...view, onOpen }
}

describe('AppealRow', () => {
  it('renders Community ban for community_ban_id appeals', () => {
    renderAppealRow({
      appeal: makeSummary({ community_ban_id: 'ban-1', user_warning_id: null }),
    })
    expect(screen.getByText('Community ban')).toBeInTheDocument()
  })

  it('renders Warning for user_warning_id appeals', () => {
    renderAppealRow({ appeal: makeSummary({ user_warning_id: 'warning-1' }) })
    expect(screen.getByText('Warning')).toBeInTheDocument()
  })

  it('renders Community post removal for community post appeals', () => {
    renderAppealRow({
      appeal: makeSummary({
        post_id: 'post-1',
        post_removal_kind: 'community',
        user_warning_id: null,
      }),
    })
    expect(screen.getByText('Community post removal')).toBeInTheDocument()
  })

  it('renders Platform post removal for platform post appeals', () => {
    renderAppealRow({
      appeal: makeSummary({
        post_id: 'post-1',
        post_removal_kind: 'platform',
        user_warning_id: null,
      }),
    })
    expect(screen.getByText('Platform post removal')).toBeInTheDocument()
  })

  it('names the appellant and shows the public target context from the summary', () => {
    renderAppealRow({
      appeal: makeSummary({
        appellant: {
          id: 'user-1',
          username: 'member',
          verified_display_name: 'Member Name',
          profile_image_id: null,
        },
        target_context: {
          type: 'warning',
          id: 'warning-1',
          public_message: 'Please keep reviews factual.',
          created_at: '2026-01-01T00:00:00Z',
          community: null,
        },
      }),
    })
    expect(screen.getByText('Member Name')).toBeInTheDocument()
    expect(screen.getByText('Please keep reviews factual.')).toBeInTheDocument()
  })

  it('shows No draft yet when the summary has no AI draft', () => {
    renderAppealRow({ appeal: makeSummary({ has_ai_draft: false }) })
    expect(screen.getByText('No draft yet')).toBeInTheDocument()
  })

  it('flags an AI draft with its recommended action without loading it', () => {
    renderAppealRow({ appeal: makeSummary({ has_ai_draft: true, recommended_action: 'deny' }) })
    expect(screen.queryByText('No draft yet')).not.toBeInTheDocument()
    expect(screen.getByText(/deny/)).toBeInTheDocument()
  })

  it('shows a response only when the summary carries one', () => {
    renderAppealRow({
      appeal: makeSummary({ public_response: 'Sent answer', sent_at: '2026-01-03T00:00:00Z' }),
    })
    expect(screen.getByText('Sent answer')).toBeInTheDocument()
  })

  it('opens the appeal by id and offers no draft or resolution actions', () => {
    const { onOpen } = renderAppealRow()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(onOpen).toHaveBeenCalledWith('appeal-1')
  })

  it('disables the open button while a request is in flight', () => {
    renderAppealRow({ disabled: true })
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled()
  })

  it('has data-pw attribute', () => {
    const { container } = renderAppealRow()
    expect(container.querySelector('[data-pw="appeal-row"]')).not.toBeNull()
  })
})
