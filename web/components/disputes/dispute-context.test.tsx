import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { esMessages } from '@ts-shared/test-helpers/locale-catalogs.mts'
import { DisputeContext } from './dispute-context'
import { toReviewDisputeSummary, type ReviewDisputeSummary } from '@/types/review-disputes'
import { makeDispute } from '@/test-helpers/disputes-client-fixtures'

const makeSummary = (overrides: Partial<ReviewDisputeSummary> = {}): ReviewDisputeSummary => ({
  ...toReviewDisputeSummary(makeDispute()),
  ...overrides,
})

describe('DisputeContext', () => {
  it('renders the disputed review link and the disputant from summary fields', () => {
    render(
      <DisputeContext
        dispute={makeSummary({
          post_slug: 'a-disputed-review',
          post_content: {
            text: 'A disputed review',
            declared_language: 'ar',
            lingua_rs_detected_language: 'en',
          },
          disputant: {
            id: 'claimant-1',
            username: 'claimant',
            verified_display_name: 'Claimant Name',
            profile_image_id: null,
          },
        })}
      />,
    )

    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute(
      'href',
      '/review/a-disputed-review',
    )
    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute('lang', 'ar')
    expect(screen.getByRole('link', { name: 'A disputed review' })).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText('Claimant Name')).toBeInTheDocument()
  })

  it('renders review content without a link when the summary has no slug', () => {
    render(
      <DisputeContext
        dispute={makeSummary({
          post_content: {
            text: 'A review without a slug',
            declared_language: null,
            lingua_rs_detected_language: null,
          },
        })}
      />,
    )

    expect(screen.getByText('A review without a slug')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'A review without a slug' })).toBeNull()
  })

  it('shows factual review label and deleted-user text when optional context is absent', () => {
    render(
      <DisputeContext
        dispute={makeSummary({
          post_content: null,
          disputant: {
            id: 'claimant-fallback',
            username: null,
            verified_display_name: null,
            profile_image_id: null,
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
          dispute={makeSummary({
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
