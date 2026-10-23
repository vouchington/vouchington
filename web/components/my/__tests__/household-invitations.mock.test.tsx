import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { navMockModule, createNavMock } from 'vouchington-tooling/next-navigation-mock'
import { HouseholdInvitations } from '../household-invitations'
import * as api from '@/lib/api/client/household-invitations'
import onError from '@/lib/on-error'
import {
  makeHouseholdInvitation,
  makeHouseholdInvitationList,
  makeHouseholdInvitationPage,
} from '@/test-helpers/api-responses/household-invitations'
import { deferred, makeMembership } from '@/test-helpers/components/my/household-manager'

let mountedAutocompletes = 0
vi.mock(import('next/navigation'), () => navMockModule)
vi.mock(import('@/components/users/user-autocomplete'), () => ({
  UserAutocomplete: ({ onChange, disabled }) => (
    <button
      type='button'
      data-pw='autocomplete-instance'
      ref={element => {
        if (element) element.dataset.mounted = String(++mountedAutocompletes)
      }}
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

  it('identifies received invitations by inviter and a distinct household owner', () => {
    const first = makeHouseholdInvitation()
    const second = makeHouseholdInvitation({
      id: '00000000-0000-7000-8000-000000000302',
      household_id: '00000000-0000-7000-8000-000000000102',
      invited_by_id: '00000000-0000-7000-8000-000000000203',
      invited_by: { id: '00000000-0000-7000-8000-000000000203', username: 'helper' },
      household_owner: { id: '00000000-0000-7000-8000-000000000205', username: 'parent' },
      relationship: '   ',
    })
    render(
      <HouseholdInvitations
        kind='received'
        initialPage={makeHouseholdInvitationPage([first, second])}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain("Invited by @helper to @parent's household")
    expect(rows[0]!.textContent).not.toContain('   ')
    expect(rows[1]!.textContent).toContain('Invited by @owner')
    expect(rows[1]!.textContent).not.toContain("'s household")
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('identifies sent invitations by invitee with a null-username fallback', () => {
    const first = makeHouseholdInvitation()
    const second = makeHouseholdInvitation({
      id: '00000000-0000-7000-8000-000000000302',
      invited_user_id: '00000000-0000-7000-8000-000000000204',
      invited_user: { id: '00000000-0000-7000-8000-000000000204', username: null },
    })
    render(
      <HouseholdInvitations
        kind='sent'
        householdId={first.household_id}
        initialPage={makeHouseholdInvitationPage([first, second])}
      />,
    )
    expect(screen.getAllByRole('listitem')[0]!.textContent).toContain('A Voucha member')
    expect(screen.getByRole('link', { name: '@alex' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
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

  it('uses the embedded invitee username and remounts the search after sending', async () => {
    const invitation = makeHouseholdInvitation({
      invited_user_id: 'user-alex',
      invited_user: { id: 'user-alex', username: 'alex' },
    })
    vi.mocked(api.createHouseholdInvitation).mockResolvedValueOnce({ invitation })
    render(
      <HouseholdInvitations
        kind='sent'
        householdId={invitation.household_id}
        initialPage={makeHouseholdInvitationPage([])}
      />,
    )
    const before = screen.getByRole('button', { name: 'Select alex' }).dataset.mounted
    fireEvent.click(screen.getByRole('button', { name: 'Select alex' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send invitation' })))
    expect(screen.getByRole('button', { name: 'Select alex' }).dataset.mounted).not.toBe(before)
    expect(screen.getByRole('link', { name: '@alex' }).getAttribute('href')).toContain('alex')
  })

  it('caps relationship input at 64 Unicode code points before sending', async () => {
    const invitation = makeHouseholdInvitation()
    vi.mocked(api.createHouseholdInvitation).mockResolvedValueOnce({ invitation })
    render(
      <HouseholdInvitations
        kind='sent'
        householdId={invitation.household_id}
        initialPage={makeHouseholdInvitationPage([])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select alex' }))
    const relationship = screen.getByLabelText('Relationship (optional)')
    fireEvent.change(relationship, { target: { value: '😀'.repeat(65) } })
    expect(relationship).toHaveValue('😀'.repeat(64))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send invitation' })))
    expect(api.createHouseholdInvitation).toHaveBeenCalledExactlyOnceWith(invitation.household_id, {
      user: 'user-alex',
      relationship: '😀'.repeat(64),
    })
  })

  it('drops optimistic rows once the server supplies a fresh page', async () => {
    const invitation = makeHouseholdInvitation()
    vi.mocked(api.createHouseholdInvitation).mockResolvedValueOnce({ invitation })
    const props = { kind: 'sent', householdId: invitation.household_id } as const
    const { rerender } = render(
      <HouseholdInvitations
        {...props}
        initialPage={makeHouseholdInvitationPage([])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select alex' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send invitation' })))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    rerender(
      <HouseholdInvitations
        {...props}
        initialPage={makeHouseholdInvitationPage([])}
      />,
    )
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
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
    const second = makeHouseholdInvitation({
      id: '00000000-0000-7000-8000-000000000300',
      invited_user: { id: first.invited_user_id, username: 'later' },
    })
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
    expect(screen.getByRole('link', { name: '@later' })).toBeTruthy()
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
