import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { ApplicationReview } from '../application-review'
import { getCommunityApplication } from '@/lib/api/client'
import type { CommunityApplicationSummary } from '@/types/api-responses'
import type { CommunityApplicationsResponseBody } from '@/types/api-responses/community-applications'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client'), async importOriginal => ({
  ...(await importOriginal()),
  getCommunityApplication: vi.fn<VitestLooseMock>(),
}))
createNavMock()

const application: CommunityApplicationSummary = {
  __entity_type: 'community_application_summary',
  id: 'application-1',
  user_id: 'applicant-1',
  status: 'pending',
  message_preview: null,
  answer_count: 0,
  created_at: '2026-05-24T00:00:00.000Z',
}

const applicant = { ...publicUsers[0]!, id: application.user_id, username: 'applicant' }

describe('ApplicationReview applicant labels', () => {
  beforeAll(async () => {
    mergeMessages('es', await loadJsonMessages('es'))
  })

  it.each([
    { user: { ...applicant, display_account: { name: 'Display name' } }, label: 'Display name' },
    { user: { ...applicant, display_account: null }, label: 'applicant' },
    { user: undefined, label: 'Usuario eliminado' },
  ])('renders $label without exposing the applicant ID', ({ user, label }) => {
    const data: CommunityApplicationsResponseBody = {
      results: [{ __entity_type: 'community_application_summary', id: application.id }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      community_application_summaries: { [application.id]: application },
      users: user ? { [user.id]: user } : {},
    }
    render(
      <LocaleProvider locale='es'>
        <ApplicationReview
          data={data}
          communitySlug='test-community'
        />
      </LocaleProvider>,
    )
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText(application.user_id)).not.toBeInTheDocument()
  })
})

describe('ApplicationReview row details', () => {
  const data: CommunityApplicationsResponseBody = {
    results: [{ __entity_type: 'community_application_summary', id: application.id }],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    community_application_summaries: {
      [application.id]: { ...application, message_preview: 'Preview text', answer_count: 1 },
    },
    users: { [applicant.id]: applicant },
  }

  it('shows the preview and loads answers in a dialog only when the row is opened', async () => {
    vi.mocked(getCommunityApplication).mockResolvedValue({
      community_application: {
        __entity_type: 'community_application',
        id: application.id,
        community_id: 'community-1',
        user_id: application.user_id,
        answers: { 'question-1': 'Full answer' },
        message: 'Full message',
        reviewed_at: null,
        reviewed_by_id: null,
        approved_at: null,
        rejected_at: null,
        rejection_reason: null,
        created_at: application.created_at,
      },
    })
    render(
      <LocaleProvider locale='en-US'>
        <ApplicationReview
          data={data}
          communitySlug='test-community'
        />
      </LocaleProvider>,
    )
    expect(screen.getByText('Preview text')).toBeInTheDocument()
    expect(screen.getByText('Answers: 1')).toBeInTheDocument()
    expect(getCommunityApplication).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(await screen.findByText('Full answer')).toBeInTheDocument()
    expect(screen.getByText('Full message')).toBeInTheDocument()
    expect(getCommunityApplication).toHaveBeenCalledWith('test-community', application.id)
  })

  it('shows an error when the details fail to load', async () => {
    vi.mocked(getCommunityApplication).mockRejectedValue(new Error('boom'))
    render(
      <LocaleProvider locale='en-US'>
        <ApplicationReview
          data={data}
          communitySlug='test-community'
        />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load application details')
  })
})
