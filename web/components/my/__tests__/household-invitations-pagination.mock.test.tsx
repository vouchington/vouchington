import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { HouseholdInvitations } from '../household-invitations'
import * as api from '@/lib/api/client/household-invitations'
import {
  makeHouseholdInvitationList,
  makeHouseholdInvitationPage,
} from '@/test-helpers/api-responses/household-invitations'

vi.mock(import('next/navigation'), () => navMockModule)

describe('HouseholdInvitations pagination', () => {
  afterEach(() => vi.restoreAllMocks())

  it('offers manual continuation without an empty message until the final page', async () => {
    const initial = makeHouseholdInvitationPage([])
    initial.pageInfo = { has_next_page: true, start_cursor: null, end_cursor: 'next' }
    vi.spyOn(api, 'getMyHouseholdInvitationsClient').mockResolvedValueOnce(
      makeHouseholdInvitationList([]),
    )
    render(
      <HouseholdInvitations
        kind='received'
        initialPage={initial}
      />,
    )

    expect(screen.queryByText('No pending invitations.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more invitations' }))

    expect(await screen.findByText('No pending invitations.')).toBeVisible()
    expect(api.getMyHouseholdInvitationsClient).toHaveBeenCalledExactlyOnceWith({
      after: 'next',
      limit: 25,
    })
    expect(screen.queryByRole('button', { name: 'Load more invitations' })).not.toBeInTheDocument()
  })
})
