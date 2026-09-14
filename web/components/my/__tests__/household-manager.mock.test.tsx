import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate, mockGetHouseholds, mockGetMemberships, mockRemove, toastMock } = vi.hoisted(
  () => ({
    mockCreate: vi.fn<VitestLooseMock>(),
    mockGetHouseholds: vi.fn<VitestLooseMock>(),
    mockGetMemberships: vi.fn<VitestLooseMock>(),
    mockRemove: vi.fn<VitestLooseMock>(),
    toastMock: {
      error: vi.fn<VitestLooseMock>(),
      success: vi.fn<VitestLooseMock>(),
    },
  }),
)

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock(import('sonner'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    toast: Object.assign(vi.fn<typeof actual.toast>(), actual.toast, toastMock),
  }
})

vi.mock(import('@/lib/api/client'), () => ({
  createHousehold: mockCreate,
  getHouseholdsClient: mockGetHouseholds,
  getHouseholdMembershipsClient: mockGetMemberships,
  removeHouseholdMembership: mockRemove,
}))

import { HouseholdManager as HouseholdManagerComponent } from '../household-manager'
import type { HouseholdMembership as Membership, HouseholdSection } from '@/types/my'
import type { PageInfo } from '@/types/api-responses'
import {
  allByPw,
  deferred,
  makeMembership,
  makeSection,
} from '../../../test-helpers/components/my/household-manager'

describe('HouseholdManager rendering and mutations', () => {
  const terminalPageInfo: PageInfo = {
    has_next_page: false,
    start_cursor: null,
    end_cursor: null,
  }

  function HouseholdManager({ initialSections }: { initialSections: HouseholdSection[] }) {
    const owned = initialSections.find(section => section.isOwner) ?? null
    const shared = initialSections.filter(section => !section.isOwner)
    return (
      <HouseholdManagerComponent
        initialOwnedSection={owned}
        initialSharedPage={{
          results: shared.map(section => ({ id: section.household.id, section })),
          page_info: terminalPageInfo,
        }}
        ownedProbeSucceeded
        sharedLoadError={false}
      />
    )
  }
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      household: { id: 'owned-created', owner_id: 'user-1', updated_at: '2026-07-02T00:00:00Z' },
    })
    mockGetMemberships.mockResolvedValue({ results: [], page_info: terminalPageInfo })
    mockGetHouseholds.mockResolvedValue({ results: [], page_info: terminalPageInfo })
    mockRemove.mockResolvedValue(undefined)
  })

  it('retries only a failed household and preserves successful sections', async () => {
    render(
      <HouseholdManager
        initialSections={[
          makeSection({ membershipLoadError: true, memberships: [] }),
          makeSection({
            household: { id: 'shared', owner_id: 'user-2', updated_at: '2026-07-01' },
            isOwner: false,
            memberships: [makeMembership({ id: 'shared-member' })],
          }),
        ]}
      />,
    )
    mockGetMemberships.mockResolvedValueOnce({
      results: [
        makeMembership({ individual: { ...makeMembership().individual, username: 'bob' } }),
      ],
      page_info: terminalPageInfo,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByText('@bob')
    expect(mockGetMemberships).toHaveBeenCalledWith('household-1', { limit: 25 })
    expect(screen.getByText('@alice')).toBeVisible()
  })

  it('rejects a stale retry result', async () => {
    const stale = deferred<{ results: Membership[]; page_info: PageInfo }>()
    const current = deferred<{ results: Membership[]; page_info: PageInfo }>()
    mockGetMemberships.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise)
    render(
      <HouseholdManager
        initialSections={[makeSection({ membershipLoadError: true, memberships: [] })]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retrying...' }))
    await act(async () => {
      current.resolve({
        results: [
          makeMembership({ individual: { ...makeMembership().individual, username: 'new' } }),
        ],
        page_info: terminalPageInfo,
      })
    })
    await act(async () => {
      stale.resolve({
        results: [
          makeMembership({ individual: { ...makeMembership().individual, username: 'stale' } }),
        ],
        page_info: terminalPageInfo,
      })
    })

    expect(screen.getByText('@new')).toBeVisible()
    expect(screen.queryByText('@stale')).not.toBeInTheDocument()
  })

  it('creates with an empty body, preserves shared sections, and deduplicates requests', async () => {
    const pending = deferred<{
      household: { id: string; owner_id: string; updated_at: string }
    }>()
    mockCreate.mockReturnValueOnce(pending.promise)
    render(
      <HouseholdManager
        initialSections={[
          makeSection({
            household: { id: 'shared', owner_id: 'user-2', updated_at: '2026-07-01' },
            isOwner: false,
          }),
        ]}
      />,
    )
    const button = screen.getByRole('button', { name: 'Create household' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith({})

    await act(async () => {
      pending.resolve({
        household: { id: 'created', owner_id: 'user-1', updated_at: '2026-07-02' },
      })
    })
    expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Shared household' })).toBeVisible()
  })

  it('preserves shared sections and the create action after a create failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('offline'))
    render(
      <HouseholdManager
        initialSections={[
          makeSection({
            household: { id: 'shared', owner_id: 'user-2', updated_at: '2026-07-01' },
            isOwner: false,
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create household' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: 'Shared household' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create household' })).toBeVisible()
  })

  it('cancels and confirms member removal', async () => {
    render(<HouseholdManager initialSections={[makeSection()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRemove).not.toHaveBeenCalled()
    expect(screen.getByText('@alice')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('household-1', 'membership-1'))
    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
  })

  it('removes optimistically and deduplicates the same request', async () => {
    const pending = deferred<void>()
    mockRemove.mockReturnValueOnce(pending.promise)
    render(<HouseholdManager initialSections={[makeSection()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
    expect(mockRemove).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve())
  })

  it('allows different removals concurrently', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    mockRemove.mockImplementation((_householdId: string, membershipId: string) =>
      membershipId === 'membership-1' ? first.promise : second.promise,
    )
    render(
      <HouseholdManager
        initialSections={[
          makeSection({
            memberships: [
              makeMembership(),
              makeMembership({
                id: 'membership-2',
                individual: { ...makeMembership().individual, username: 'bob' },
              }),
            ],
          }),
        ]}
      />,
    )
    const rows = allByPw('household-member-row')
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(mockRemove).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
    expect(screen.queryByText('@bob')).not.toBeInTheDocument()
    await act(async () => {
      first.resolve()
      second.resolve()
    })
  })
})
