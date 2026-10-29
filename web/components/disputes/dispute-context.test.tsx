import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { DisputeContext } from './dispute-context'
import { makeDispute } from '@/test-helpers/disputes-client-fixtures'

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
      '/review/a-disputed-review',
    )
    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute('lang', 'ar')
    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText('The review being disputed.')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('Claimant Name')).toBeInTheDocument()
    expect(screen.getByText('The published terms are inaccurate.')).toBeInTheDocument()
  })

  it('renders review content without a link when staff context has no slug', () => {
    const dispute = makeDispute({
      post_content: {
        text: 'A review without a slug',
        declared_language: null,
        lingua_rs_detected_language: null,
      },
    })
    render(<DisputeContext dispute={dispute} />)

    expect(screen.getByText('A review without a slug')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'A review without a slug' })).toBeNull()
  })

  it('shows factual review label and deleted-user text when optional context is absent', () => {
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

    expect(screen.getByText('A review')).toBeInTheDocument()
    expect(screen.getByText('Deleted user')).toBeInTheDocument()
    expect(screen.queryByText('post-1')).not.toBeInTheDocument()
    expect(screen.queryByText('claimant-fallback')).not.toBeInTheDocument()
  })

  it('translates the redacted review fallback and keeps its id out of view', async () => {
    mergeMessages('es', esMessages)
    render(
      <UiLocaleProvider uiLocale='es'>
        <DisputeContext
          dispute={makeDispute({
            post_id: 'post-private',
            post_label: 'review',
            post_content: null,
          })}
        />
      </UiLocaleProvider>,
    )
    expect(await screen.findByText('Revisión')).toBeInTheDocument()
    expect(screen.queryByText('review')).not.toBeInTheDocument()
    expect(screen.queryByText('post-private')).not.toBeInTheDocument()
  })
})
