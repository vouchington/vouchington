import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { ApplicationReview } from '../application-review'
import type { CommunityApplication, CommunityApplicationsResponseBody } from '@/types/api-responses'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
createNavMock()

const application: CommunityApplication = {
  __entity_type: 'community_application',
  id: 'application-1',
  community_id: 'community-1',
  user_id: 'applicant-1',
  answers: {},
  message: null,
  reviewed_at: null,
  reviewed_by_id: null,
  approved_at: null,
  rejected_at: null,
  rejection_reason: null,
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
      results: [{ __entity_type: 'community_application', id: application.id }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      community_applications: { [application.id]: application },
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
