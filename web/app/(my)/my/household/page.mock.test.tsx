import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeHouseholdInvitation,
  makeHouseholdInvitationList,
} from '@/test-helpers/api-responses/household-invitations'

const { mockSentInvitations, mockReceivedInvitations } = vi.hoisted(() => ({
  mockSentInvitations:
    vi.fn<typeof import('@/lib/api/server/household-invitations').getHouseholdInvitations>(),
  mockReceivedInvitations:
    vi.fn<typeof import('@/lib/api/server/household-invitations').getMyHouseholdInvitations>(),
}))
vi.mock(import('@/lib/api/server/household-invitations'), () => ({
  getHouseholdInvitations: mockSentInvitations,
  getMyHouseholdInvitations: mockReceivedInvitations,
}))

const { mockRequireCurrentUser, mockGetHouseholdMemberships, mockGetHouseholds } = vi.hoisted(
  () => ({
    mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
    mockGetHouseholdMemberships: vi.fn<VitestLooseMock>(),
    mockGetHouseholds: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getHouseholdMemberships: mockGetHouseholdMemberships,
  getHouseholds: mockGetHouseholds,
}))

vi.mock(import('@/components/my/household-page-content'), () => ({
  HouseholdPageContent: (props: object) => (
    <pre data-pw='household-manager'>{JSON.stringify(props)}</pre>
  ),
}))

import HouseholdPage from './page'

const pageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

function managerProps() {
  const element = document.querySelector<HTMLElement>('[data-pw="household-manager"]')
  if (!element) throw new Error('Expected projected household manager')
  return JSON.parse(element.textContent ?? '{}')
}

describe('HouseholdPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1', username: 'alice' })
    mockGetHouseholdMemberships.mockResolvedValue({ results: [], page_info: pageInfo })
    mockSentInvitations.mockResolvedValue(makeHouseholdInvitationList([]))
    mockReceivedInvitations.mockResolvedValue(makeHouseholdInvitationList([]))
  })

  it('requests owned and member-only households independently with bounded first pages', async () => {
    mockGetHouseholds
      .mockResolvedValueOnce({
        results: [{ id: 'owned-newest', owner_user_id: 'user-1', updated_at: '2026-07-02' }],
        page_info: pageInfo,
      })
      .mockResolvedValueOnce({
        results: [{ id: 'shared-1', owner_user_id: 'user-2', updated_at: '2026-07-01' }],
        page_info: { ...pageInfo, has_next_page: true, end_cursor: 'shared-next' },
      })

    render(await HouseholdPage())

    expect(mockGetHouseholds).toHaveBeenNthCalledWith(1, { access: 'owned', limit: 1 })
    expect(mockGetHouseholds).toHaveBeenNthCalledWith(2, { access: 'member', limit: 25 })
    expect(mockGetHouseholdMemberships).toHaveBeenCalledWith('owned-newest', { limit: 25 })
    expect(mockGetHouseholdMemberships).toHaveBeenCalledWith('shared-1', { limit: 25 })
    expect(mockSentInvitations).toHaveBeenCalledExactlyOnceWith('owned-newest', { limit: 25 })
    expect(mockReceivedInvitations).toHaveBeenCalledExactlyOnceWith({ limit: 25 })
    expect(managerProps()).toMatchObject({
      initialOwnedSection: { household: { id: 'owned-newest' }, isOwner: true },
      initialSharedPage: {
        results: [{ id: 'shared-1', section: { isOwner: false } }],
        page_info: { has_next_page: true, end_cursor: 'shared-next' },
      },
      ownedProbeSucceeded: true,
      sharedLoadError: false,
    })
  })

  it('passes embedded invitation identities to the household page', async () => {
    const invitation = makeHouseholdInvitation()
    mockGetHouseholds.mockResolvedValue({ results: [], page_info: pageInfo })
    mockReceivedInvitations.mockResolvedValue(makeHouseholdInvitationList([invitation]))
    render(await HouseholdPage())
    expect(managerProps().receivedInvitations.invitations).toEqual([invitation])
  })

  it('projects a failed incoming invitation load separately from an empty page', async () => {
    mockGetHouseholds.mockResolvedValue({ results: [], page_info: pageInfo })
    mockReceivedInvitations.mockRejectedValueOnce(new Error('Unavailable'))
    render(await HouseholdPage())
    expect(managerProps()).toMatchObject({
      sentInvitations: null,
      receivedInvitations: { invitations: [], loadError: true },
    })
    expect(mockSentInvitations).not.toHaveBeenCalled()
  })

  it('enables creation only after a successful empty owned probe', async () => {
    mockGetHouseholds
      .mockResolvedValueOnce({ results: [], page_info: pageInfo })
      .mockRejectedValueOnce(new Error('member list unavailable'))

    render(await HouseholdPage())

    expect(managerProps()).toMatchObject({
      initialOwnedSection: null,
      ownedProbeSucceeded: true,
      sharedLoadError: true,
    })
  })

  it('does not enable creation when the owned probe fails', async () => {
    mockGetHouseholds
      .mockRejectedValueOnce(new Error('owned probe unavailable'))
      .mockResolvedValueOnce({ results: [], page_info: pageInfo })

    render(await HouseholdPage())

    expect(managerProps()).toMatchObject({
      initialOwnedSection: null,
      ownedProbeSucceeded: false,
      sharedLoadError: false,
    })
  })

  it('preserves successful membership sections when another section fails', async () => {
    mockGetHouseholds
      .mockResolvedValueOnce({
        results: [{ id: 'owned', owner_user_id: 'user-1', updated_at: '2026-07-02' }],
        page_info: pageInfo,
      })
      .mockResolvedValueOnce({
        results: [{ id: 'shared', owner_user_id: 'user-2', updated_at: '2026-07-01' }],
        page_info: pageInfo,
      })
    mockGetHouseholdMemberships
      .mockResolvedValueOnce({ results: [{ id: 'owned-member' }], page_info: pageInfo })
      .mockRejectedValueOnce(new Error('shared members unavailable'))

    render(await HouseholdPage())

    expect(screen.getByText('Household')).toBeInTheDocument()
    expect(managerProps()).toMatchObject({
      initialOwnedSection: {
        memberships: [{ id: 'owned-member' }],
        membershipLoadError: false,
      },
      initialSharedPage: {
        results: [{ section: { memberships: [], membershipLoadError: true } }],
      },
    })
  })
})
