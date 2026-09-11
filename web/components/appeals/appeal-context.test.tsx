import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppealContext } from './appeal-context'
import { makeAppeal } from './fixtures/appeals-client-fixtures'

describe('AppealContext', () => {
  it('renders human-readable appellant, target, and original-decision context', () => {
    render(
      <AppealContext
        appeal={makeAppeal({
          target_context: {
            type: 'warning',
            id: 'warning-1',
            public_message: 'Please keep reviews factual.',
            created_at: '2026-01-01T00:00:00Z',
            community: null,
          },
          staff_context: {
            appellant: {
              id: 'user-1',
              username: 'member',
              verified_display_name: 'Member Name',
              profile_image_id: null,
            },
            original_decision: {
              internal_reason: 'Repeated unsupported claims.',
              actor: {
                id: 'staff-1',
                username: 'moderator',
                verified_display_name: null,
                profile_image_id: null,
              },
            },
          },
        })}
      />,
    )

    expect(screen.getByText('Member Name')).toBeInTheDocument()
    expect(screen.getByText('Please keep reviews factual.')).toBeInTheDocument()
    expect(screen.getByText('Repeated unsupported claims.')).toBeInTheDocument()
    expect(screen.getByText('moderator')).toBeInTheDocument()
  })

  it('falls back to stable identifiers when optional display context is absent', () => {
    render(
      <AppealContext
        appeal={makeAppeal({
          user_warning_id: null,
          target_context: null,
          staff_context: {
            appellant: {
              id: 'user-fallback',
              username: null,
              verified_display_name: null,
              profile_image_id: null,
            },
            original_decision: { internal_reason: null, actor: null },
          },
        })}
      />,
    )

    expect(screen.getByText('user-fallback')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('renders a removed post title and public reason as independent context', () => {
    render(
      <AppealContext
        appeal={makeAppeal({
          user_warning_id: null,
          post_id: 'post-1',
          post_removal_kind: 'platform',
          target_context: {
            type: 'post_removal',
            id: 'post-1',
            kind: 'platform',
            title: 'Repeated unsupported claims',
            declared_language: 'ar',
            lingua_rs_detected_language: 'en',
            decided_at: '2026-01-01T00:00:00Z',
            public_reason: 'Repeated unsupported claims',
            community: null,
          },
        })}
      />,
    )

    expect(screen.getAllByText('Repeated unsupported claims')).toHaveLength(2)
    expect(screen.getAllByText('Repeated unsupported claims')[0]).toHaveAttribute('lang', 'ar')
  })
})
