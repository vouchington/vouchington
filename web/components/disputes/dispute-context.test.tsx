import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DisputeContext } from './dispute-context'
import { makeDispute } from './fixtures/disputes-client-fixtures'

describe('DisputeContext', () => {
  it('renders the disputed review, topic, rating, disputant, and claim', () => {
    render(
      <DisputeContext
        dispute={makeDispute({
          staff_context: {
            disputant: {
              id: 'claimant-1',
              username: 'claimant',
              verified_display_name: 'Claimant Name',
              profile_image_id: null,
            },
            review: {
              post: {
                id: 'post-1',
                title: 'A disputed review',
                declared_language: 'ar',
                lingua_rs_detected_language: 'en',
                slug: 'a-disputed-review',
                markdown_preview: 'The review being disputed.',
                created_by_id: 'author-1',
                created_at: '2026-01-01T00:00:00Z',
              },
              topic: {
                id: 'topic-1',
                name: 'Acme',
                slug: 'acme',
                topic_type: 'business',
              },
              rating: 2,
            },
          },
          post_content: {
            text: 'A disputed review',
            declared_language: 'ar',
            lingua_rs_detected_language: 'en',
          },
          claim_text: 'The published terms are inaccurate.',
        })}
      />,
    )

    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute(
      'href',
      '/review/post-1',
    )
    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute('lang', 'ar')
    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText('The review being disputed.')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('Claimant Name')).toBeInTheDocument()
    expect(screen.getByText('The published terms are inaccurate.')).toBeInTheDocument()
  })

  it('falls back to target and disputant identifiers when optional context is absent', () => {
    render(
      <DisputeContext
        dispute={makeDispute({
          post_content: null,
          staff_context: {
            disputant: {
              id: 'claimant-fallback',
              username: null,
              verified_display_name: null,
              profile_image_id: null,
            },
            review: {
              post: {
                id: 'post-1',
                title: '',
                declared_language: null,
                lingua_rs_detected_language: null,
                slug: null,
                markdown_preview: '',
                created_by_id: null,
                created_at: '2026-01-01T00:00:00Z',
              },
              topic: null,
              rating: null,
            },
          },
        })}
      />,
    )

    expect(screen.getByText('post-1')).toBeInTheDocument()
    expect(screen.getByText('claimant-fallback')).toBeInTheDocument()
  })
})
