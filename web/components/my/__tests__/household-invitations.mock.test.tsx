import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { HouseholdInvitations } from '../household-invitations'
import * as api from '@/lib/api/client/household-invitations'
import onError from '@/lib/on-error'
import {
  makeHouseholdInvitation,
  makeHouseholdInvitationList,
  makeHouseholdInvitationPage,
} from '@/test-helpers/api-responses/household-invitations'
import { deferred, makeMembership } from '@/test-helpers/components/my/household-manager'

vi.mock(import('next/navigation'), () => navMockModule)
vi.mock(import('@/components/users/user-autocomplete'), () => ({
  UserAutocomplete: ({ onChange, disabled }) => (
    <button
      type='button'
      disabled={disabled}
      onClick={() => onChange('user-alex', 'alex')}
    >
      Select alex
    </button>
  ),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<typeof import('@/lib/on-error').default>(),
  onSuccess: vi.fn<typeof import('@/lib/on-error').onSuccess>(),
}))
vi.mock(import('@/lib/api/client/household-invitations'), () => ({
  acceptHouseholdInvitation:
    vi.fn<typeof import('@/lib/api/client/household-invitations').acceptHouseholdInvitation>(),
  declineHouseholdInvitation:
    vi.fn<typeof import('@/lib/api/client/household-invitations').declineHouseholdInvitation>(),
  createHouseholdInvitation:
    vi.fn<typeof import('@/lib/api/client/household-invitations').createHouseholdInvitation>(),
  revokeHouseholdInvitation:
    vi.fn<typeof import('@/lib/api/client/household-invitations').revokeHouseholdInvitation>(),
  getHouseholdInvitationsClient:
    vi.fn<typeof import('@/lib/api/client/household-invitations').getHouseholdInvitationsClient>(),
  getMyHouseholdInvitationsClient:
    vi.fn<
      typeof import('@/lib/api/client/household-invitations').getMyHouseholdInvitationsClient
    >(),
}))

describe('household invitation actions', () => {
  const nav = createNavMock()
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
  })
  afterEach(cleanup)

  it.each(['received', 'sent'] as const)('identifies each %s invitation before an action', kind => {
    const first = makeHouseholdInvitation()
    const second = makeHouseholdInvitation({
      id: '00000000-0000-7000-8000-000000000302',
      household_id:
        kind === 'received' ? '00000000-0000-7000-8000-000000000102' : first.household_id,
      invited_by_id: '00000000-0000-7000-8000-000000000203',
      invited_user_id: '00000000-0000-7000-8000-000000000204',
    })
    render(
      <HouseholdInvitations
        {...(kind === 'sent' ? { kind, householdId: first.household_id } : { kind })}
        initialPage={makeHouseholdInvitationPage([first, second])}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    for (const invitation of [first, second]) {
      const userId = kind === 'received' ? invitation.invited_by_id : invitation.invited_user_id
      const row = within(screen.getByRole('link', { name: userId }).closest('li')!)
      expect(row.getByRole('link', { name: userId }).getAttribute('href')).toContain(userId)
      expect(row.getByText(invitation.household_id)).toBeTruthy()
      expect(
        row.getByRole('button', { name: kind === 'received' ? 'Accept' : 'Revoke invitation' }),
      ).toBeTruthy()
    }
  })

  it('sends a selected user once while pending, and keeps duplicate responses as one row', async () => {
    const invitation = makeHouseholdInvitation()
    const request = deferred<Awaited<ReturnType<typeof api.createHouseholdInvitation>>>()
    vi.mocked(api.createHouseholdInvitation).mockReturnValueOnce(request.promise)
    render(
      <HouseholdInvitations
        kind='sent'
        householdId={invitation.household_id}
        initialPage={makeHouseholdInvitationPage()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select alex' }))
    fireEvent.change(screen.getByLabelText('Relationship (optional)'), {
      target: { value: 'Family' },
    })
    const send = screen.getByRole('button', { name: 'Send invitation' })
    fireEvent.click(send)
    fireEvent.click(send)
    expect(api.createHouseholdInvitation).toHaveBeenCalledExactlyOnceWith(invitation.household_id, {
      user: 'user-alex',
      relationship: 'Family',
    })
    expect((send as HTMLButtonElement).disabled).toBe(true)
    await act(async () => request.resolve({ invitation }))
    expect(document.querySelectorAll('[data-pw="household-invitation-row"]')).toHaveLength(1)
    expect(nav.refresh).toHaveBeenCalledOnce()
  })

  it.each(['accept', 'decline'] as const)(
    'handles invitee %s and refreshes household membership data',
    async action => {
      const invitation = makeHouseholdInvitation()
      vi.mocked(api.acceptHouseholdInvitation).mockResolvedValue({ membership: makeMembership() })
      vi.mocked(api.declineHouseholdInvitation).mockResolvedValue(undefined)
      render(
        <HouseholdInvitations
          kind='received'
          initialPage={makeHouseholdInvitationPage([invitation])}
        />,
      )
      await act(async () =>
        fireEvent.click(
          screen.getByRole('button', { name: action === 'accept' ? 'Accept' : 'Decline' }),
        ),
      )
      const expected =
        action === 'accept' ? api.acceptHouseholdInvitation : api.declineHouseholdInvitation
      expect(expected).toHaveBeenCalledExactlyOnceWith(invitation.id)
      expect(screen.getByText('No pending invitations.')).not.toBeNull()
      expect(nav.refresh).toHaveBeenCalledOnce()
    },
  )

  it('keeps a failed revoke visible for retry', async () => {
    const invitation = makeHouseholdInvitation()
    const error = new Error('Temporary failure')
    vi.mocked(api.revokeHouseholdInvitation).mockRejectedValueOnce(error)
    render(
      <HouseholdInvitations
        kind='sent'
        householdId={invitation.household_id}
        initialPage={makeHouseholdInvitationPage([invitation])}
      />,
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' })),
    )
    expect(api.revokeHouseholdInvitation).toHaveBeenCalledExactlyOnceWith(
      invitation.household_id,
      invitation.id,
    )
    expect(document.querySelectorAll('[data-pw="household-invitation-row"]')).toHaveLength(1)
    expect(onError).toHaveBeenCalledWith(error, {
      fallback: 'The invitation could not be updated.',
    })
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('continues from the cursor and removes a successfully revoked row', async () => {
    const first = makeHouseholdInvitation()
    const second = makeHouseholdInvitation({ id: '00000000-0000-7000-8000-000000000300' })
    const initial = makeHouseholdInvitationPage([first])
    initial.pageInfo = { has_next_page: true, start_cursor: 'start', end_cursor: 'next' }
    vi.mocked(api.getHouseholdInvitationsClient).mockResolvedValueOnce(
      makeHouseholdInvitationList([second]),
    )
    vi.mocked(api.revokeHouseholdInvitation).mockResolvedValueOnce(undefined)
    render(
      <HouseholdInvitations
        kind='sent'
        householdId={first.household_id}
        initialPage={initial}
      />,
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Load more invitations' })),
    )
    expect(api.getHouseholdInvitationsClient).toHaveBeenCalledExactlyOnceWith(first.household_id, {
      after: 'next',
      limit: 25,
    })
    expect(document.querySelectorAll('[data-pw="household-invitation-row"]')).toHaveLength(2)
    await act(async () =>
      fireEvent.click(screen.getAllByRole('button', { name: 'Revoke invitation' })[0]!),
    )
    expect(document.querySelectorAll('[data-pw="household-invitation-row"]')).toHaveLength(1)
  })

  it('retries a failed first page and accepts a later server refresh', async () => {
    const failed = { ...makeHouseholdInvitationPage([]), loadError: true }
    vi.mocked(api.getMyHouseholdInvitationsClient).mockResolvedValueOnce(
      makeHouseholdInvitationList(),
    )
    const view = render(
      <HouseholdInvitations
        kind='received'
        initialPage={failed}
      />,
    )
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelectorAll('[data-pw="household-invitation-row"]')).toHaveLength(1)
    view.rerender(
      <HouseholdInvitations
        kind='received'
        initialPage={makeHouseholdInvitationPage([])}
      />,
    )
    expect(screen.getByText('No pending invitations.')).not.toBeNull()
  })
})
