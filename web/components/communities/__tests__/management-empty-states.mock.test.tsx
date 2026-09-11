import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationReview } from '../application-review'
import { CommunityMembersManager } from '../community-members-manager'
import { InviteManager } from '../invite-manager'
import type {
  Community,
  CommunityApplicationsResponseBody,
  CommunityInvitesResponseBody,
  CommunityMembersResponseBody,
} from '@/types/api-responses'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  approveApplication: vi.fn<VitestLooseMock>(),
  banMember: vi.fn<VitestLooseMock>(),
  getPaginatedPage: vi.fn<VitestLooseMock>(),
  rejectApplication: vi.fn<VitestLooseMock>(),
  removeMember: vi.fn<VitestLooseMock>(),
  revokeInvite: vi.fn<VitestLooseMock>(),
  sendInvite: vi.fn<VitestLooseMock>(),
  transferOwnership: vi.fn<VitestLooseMock>(),
  updateMemberRole: vi.fn<VitestLooseMock>(),
}))

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }

const emptyApplicationsData: CommunityApplicationsResponseBody = {
  results: [],
  page_info: pageInfo,
  community_applications: {},
}

const emptyMembersData: CommunityMembersResponseBody = {
  results: [],
  page_info: pageInfo,
  community_members: {},
  users: {},
}

const emptyInvitesData: CommunityInvitesResponseBody = {
  results: [],
  page_info: pageInfo,
  community_invites: {},
}

const community = {
  id: 'community-1',
  slug: 'test-community',
  name: 'Test Community',
} as unknown as Community

function expectSearchFilterDescriptionToBeAbsent() {
  expect(screen.queryByText('Try adjusting your search or filters')).not.toBeInTheDocument()
}

describe('community management empty states', () => {
  it('uses contextual copy for an empty application queue', () => {
    render(
      <ApplicationReview
        data={emptyApplicationsData}
        communitySlug='test-community'
      />,
    )

    expect(screen.getByText('No applications to review')).toBeInTheDocument()
    expect(screen.getByText('Pending member applications will show up here.')).toBeInTheDocument()
    expectSearchFilterDescriptionToBeAbsent()
  })

  it('uses contextual copy for an empty members list', () => {
    render(
      <CommunityMembersManager
        community={community}
        currentUserMembership={undefined}
        data={emptyMembersData}
      />,
    )

    expect(screen.getByText('No members yet')).toBeInTheDocument()
    expect(screen.getByText('Members of this community will be listed here.')).toBeInTheDocument()
    expectSearchFilterDescriptionToBeAbsent()
  })

  it('uses contextual copy for an empty invite list', () => {
    render(
      <InviteManager
        data={emptyInvitesData}
        communitySlug='test-community'
      />,
    )

    expect(screen.getByText('No invites sent yet')).toBeInTheDocument()
    expect(
      screen.getByText('Use the form above to invite members by email or username.'),
    ).toBeInTheDocument()
    expectSearchFilterDescriptionToBeAbsent()
  })
})
