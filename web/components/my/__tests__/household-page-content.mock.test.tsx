import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HouseholdPageContent } from '../household-page-content'
import { createHousehold } from '@/lib/api/client'
import { makeSection } from '@/test-helpers/components/my/household-manager'
import { makeHouseholdInvitationPage } from '@/test-helpers/api-responses/household-invitations'

vi.mock(import('@/lib/api/client'), () => ({
  createHousehold: vi.fn<typeof import('@/lib/api/client').createHousehold>(),
  getHouseholdsClient: vi.fn<typeof import('@/lib/api/client').getHouseholdsClient>(),
  getHouseholdMembershipsClient:
    vi.fn<typeof import('@/lib/api/client').getHouseholdMembershipsClient>(),
  removeHouseholdMembership: vi.fn<typeof import('@/lib/api/client').removeHouseholdMembership>(),
  getPaginatedPage: vi.fn<() => Promise<never>>(() =>
    Promise.reject(new Error('Unexpected pagination request')),
  ),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<typeof import('@/lib/on-error').default>(),
  onSuccess: vi.fn<typeof import('@/lib/on-error').onSuccess>(),
}))
vi.mock(import('../household-invitations'), () => ({
  HouseholdInvitations: (
    props: Parameters<typeof import('../household-invitations').HouseholdInvitations>[0],
  ) => <pre data-testid={`invitations-${props.kind}`}>{JSON.stringify(props)}</pre>,
}))

describe('household page invitation integration', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)
  const section = makeSection({ isOwner: false })
  const props = {
    initialOwnedSection: null,
    initialSharedPage: {
      results: [{ id: section.household.id, section }],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    },
    ownedProbeSucceeded: true,
    sharedLoadError: false,
    sentInvitations: null,
    receivedInvitations: makeHouseholdInvitationPage([]),
  }
  it('offers invitations immediately after household creation', async () => {
    vi.mocked(createHousehold).mockResolvedValueOnce({
      household: {
        id: 'new-household',
        owner_user_id: 'user-1',
        updated_at: '2026-07-01',
      },
    })
    render(<HouseholdPageContent {...props} />)
    expect(screen.queryByTestId('invitations-sent')).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create household' })))
    expect(JSON.parse(screen.getByTestId('invitations-sent').textContent!)).toMatchObject({
      householdId: 'new-household',
      initialPage: { invitations: [], loadError: false },
    })
  })
  it('resets local household cursor history on a server refresh even when household IDs are unchanged', () => {
    const view = render(<HouseholdPageContent {...props} />)
    expect(screen.getByText('@alice')).not.toBeNull()
    const nextSection = makeSection({ isOwner: false, memberships: [] })
    view.rerender(
      <HouseholdPageContent
        {...props}
        initialSharedPage={{
          ...props.initialSharedPage,
          results: [{ id: section.household.id, section: nextSection }],
        }}
      />,
    )
    expect(screen.queryByText('@alice')).toBeNull()
    expect(screen.getByText('No members yet.')).not.toBeNull()
  })
})
