import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberAppealRow } from './member-appeal-row'
import type { ModerationAppeal } from '@/types/appeals'

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

describe('MemberAppealRow', () => {
  it('shows Community ban when community_ban_id is set', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow
            appeal={makeAppeal({ community_ban_id: 'ban-1', user_warning_id: null })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Community ban')).toBeInTheDocument()
  })

  it('shows Warning when user_warning_id is set', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow appeal={makeAppeal({ user_warning_id: 'warning-1' })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Warning')).toBeInTheDocument()
  })

  it('shows Post removal when post_id is set', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow appeal={makeAppeal({ post_id: 'post-1', user_warning_id: null })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Post removal')).toBeInTheDocument()
  })

  it('shows Community post removal when post_removal_kind is community', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow
            appeal={makeAppeal({
              post_id: 'post-1',
              post_removal_kind: 'community',
              user_warning_id: null,
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Community post removal')).toBeInTheDocument()
  })

  it('shows Platform post removal when post_removal_kind is platform', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow
            appeal={makeAppeal({
              post_id: 'post-1',
              post_removal_kind: 'platform',
              user_warning_id: null,
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Platform post removal')).toBeInTheDocument()
  })

  it('shows Pending review when sent_at is not set', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow appeal={makeAppeal({ sent_at: null })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Pending review')).toBeInTheDocument()
  })

  it('shows public_response when sent_at is set', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow
            appeal={makeAppeal({
              sent_at: '2026-01-02T00:00:00Z',
              public_response: 'Your appeal has been reviewed.',
              status: 'resolved',
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Your appeal has been reviewed.')).toBeInTheDocument()
  })

  it('shows Unknown when no target id is set', () => {
    render(
      <table>
        <tbody>
          <MemberAppealRow
            appeal={makeAppeal({ user_warning_id: null, community_ban_id: null, post_id: null })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('has data-pw attribute', () => {
    const { container } = render(
      <table>
        <tbody>
          <MemberAppealRow appeal={makeAppeal()} />
        </tbody>
      </table>,
    )
    expect(container.querySelector('[data-pw="member-appeal-row"]')).not.toBeNull()
  })
})
