import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberDisputeRow } from './member-dispute-row'
import type { ReviewDispute } from '@/types/review-disputes'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'

function makeDispute(overrides: Partial<ReviewDispute> = {}): ReviewDispute {
  return {
    id: 'dispute-1',
    post_id: 'post-1',
    post_label: 'A review',
    topic_id: 'topic-1',
    reason: 'factually_inaccurate',
    status: 'pending',
    post_content: { text: 'A Review', declared_language: null, lingua_rs_detected_language: null },
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('MemberDisputeRow', () => {
  it('renders a link to the target content', () => {
    render(
      <table>
        <tbody>
          <MemberDisputeRow dispute={makeDispute()} />
        </tbody>
      </table>,
    )
    const link = screen.getByRole('link', { name: 'A Review' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/review/post-1')
  })

  it('shows the factual post label when post content is unavailable', () => {
    render(
      <table>
        <tbody>
          <MemberDisputeRow dispute={makeDispute({ post_content: null })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('A review')).toBeInTheDocument()
    expect(screen.queryByText('post-1')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('translates the redacted review fallback', async () => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleProvider uiLocale='es'>
        <table>
          <tbody>
            <MemberDisputeRow dispute={makeDispute({ post_label: 'review', post_content: null })} />
          </tbody>
        </table>
      </UiLocaleProvider>,
    )
    expect(await screen.findByText('Revisión')).toBeInTheDocument()
    expect(screen.queryByText('review')).not.toBeInTheDocument()
    expect(screen.queryByText('post-1')).not.toBeInTheDocument()
  })

  it('shows pending review text when not yet sent', () => {
    render(
      <table>
        <tbody>
          <MemberDisputeRow dispute={makeDispute({ sent_at: undefined })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Pending review')).toBeInTheDocument()
  })

  it('shows public_response when sent_at is set', () => {
    render(
      <table>
        <tbody>
          <MemberDisputeRow
            dispute={makeDispute({
              sent_at: '2026-01-02T00:00:00Z',
              public_response: 'Moderator resolution text.',
              status: 'resolved',
            })}
          />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Moderator resolution text.')).toBeInTheDocument()
  })

  it('has data-pw attribute', () => {
    const { container } = render(
      <table>
        <tbody>
          <MemberDisputeRow dispute={makeDispute()} />
        </tbody>
      </table>,
    )
    expect(container.querySelector('[data-pw="member-dispute-row"]')).not.toBeNull()
  })
})
