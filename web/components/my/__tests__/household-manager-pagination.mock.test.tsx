import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate, mockGetHouseholds, mockGetMemberships, mockRemove } = vi.hoisted(() => ({
  mockCreate: vi.fn<VitestLooseMock>(),
  mockGetHouseholds: vi.fn<VitestLooseMock>(),
  mockGetMemberships: vi.fn<VitestLooseMock>(),
  mockRemove: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock(import('@/lib/api/client'), () => ({
  createHousehold: mockCreate,
  getHouseholdsClient: mockGetHouseholds,
  getHouseholdMembershipsClient: mockGetMemberships,
  removeHouseholdMembership: mockRemove,
}))

import { HouseholdManager } from '../household-manager'
import type { HouseholdMembership as Membership } from '@/types/my'
import type { PageInfo } from '@/types/api-responses'
import {
  allByPw,
  deferred,
  makeMembership,
  makeSection,
} from '../../../test-helpers/components/my/household-manager'

describe('HouseholdManager pagination', () => {
  const terminalPageInfo: PageInfo = {
    has_next_page: false,
    start_cursor: null,
    end_cursor: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMemberships.mockResolvedValue({ results: [], page_info: terminalPageInfo })
    mockRemove.mockResolvedValue(undefined)
  })

  function renderSharedPage() {
    const shared = makeSection({
      household: { id: 'shared-1', owner_id: 'user-2', updated_at: '2026-07-02' },
      isOwner: false,
    })
    render(
      <HouseholdManager
        initialOwnedSection={null}
        initialSharedPage={{
          results: [{ id: shared.household.id, section: shared }],
          page_info: { ...terminalPageInfo, has_next_page: true, end_cursor: 'shared-next' },
        }}
        ownedProbeSucceeded
        sharedLoadError={false}
      />,
    )
  }

  it('loads the next shared page once and deduplicates stable household ids', async () => {
    const shared = makeSection({
      household: { id: 'shared-1', owner_id: 'user-2', updated_at: '2026-07-02' },
      isOwner: false,
    })
    mockGetHouseholds.mockResolvedValueOnce({
      results: [shared.household, { id: 'shared-2', owner_id: 'user-3', updated_at: '2026-07-01' }],
      page_info: terminalPageInfo,
    })
    renderSharedPage()

    fireEvent.click(within(allByPw('paginated-list-continuation').at(-1)!).getByRole('button'))

    await screen.findByRole('heading', { name: 'Shared household 2' })
    expect(allByPw('household-section')).toHaveLength(2)
    expect(mockGetHouseholds).toHaveBeenCalledWith({
      access: 'member',
      after: 'shared-next',
      limit: 25,
    })
  })

  it('preserves rows and retries the same cursor after a continuation failure', async () => {
    mockGetHouseholds.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      results: [{ id: 'shared-2', owner_id: 'user-3', updated_at: '2026-07-01' }],
      page_info: terminalPageInfo,
    })
    renderSharedPage()
    fireEvent.click(within(allByPw('paginated-list-continuation').at(-1)!).getByRole('button'))
    await waitFor(() => expect(allByPw('paginated-list-retry')).toHaveLength(1))
    expect(screen.getByRole('heading', { name: 'Shared household' })).toBeVisible()

    fireEvent.click(within(allByPw('paginated-list-continuation').at(-1)!).getByRole('button'))

    await screen.findByRole('heading', { name: 'Shared household 2' })
    expect(mockGetHouseholds.mock.calls[0]).toEqual(mockGetHouseholds.mock.calls[1])
  })

  it('paginates memberships independently and keeps removed rows tombstoned', async () => {
    const nextPage = deferred<{ results: Membership[]; page_info: PageInfo }>()
    mockGetMemberships.mockReturnValueOnce(nextPage.promise)
    const section = makeSection({
      membershipPageInfo: {
        ...terminalPageInfo,
        has_next_page: true,
        end_cursor: 'member-next',
      },
    })
    render(
      <HouseholdManager
        initialOwnedSection={section}
        initialSharedPage={{ results: [], page_info: terminalPageInfo }}
        ownedProbeSucceeded
        sharedLoadError={false}
      />,
    )

    fireEvent.click(within(allByPw('paginated-list-continuation')[0]!).getByRole('button'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await act(async () => {
      nextPage.resolve({
        results: [
          makeMembership(),
          makeMembership({
            id: 'membership-2',
            individual: { ...makeMembership().individual, username: 'bob' },
          }),
        ],
        page_info: terminalPageInfo,
      })
    })

    await screen.findByText('@bob')
    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
    expect(mockGetMemberships).toHaveBeenCalledWith('household-1', {
      after: 'member-next',
      limit: 25,
    })
  })

  it('restores a failed page-two removal at its exact loaded position', async () => {
    mockGetMemberships.mockResolvedValueOnce({
      results: [
        makeMembership({
          id: 'membership-2',
          individual: { ...makeMembership().individual, username: 'bob' },
        }),
        makeMembership({
          id: 'membership-3',
          individual: { ...makeMembership().individual, username: 'carol' },
        }),
      ],
      page_info: terminalPageInfo,
    })
    mockRemove.mockRejectedValueOnce(new Error('offline'))
    const section = makeSection({
      membershipPageInfo: {
        ...terminalPageInfo,
        has_next_page: true,
        end_cursor: 'member-next',
      },
    })
    render(
      <HouseholdManager
        initialOwnedSection={section}
        initialSharedPage={{ results: [], page_info: terminalPageInfo }}
        ownedProbeSucceeded
        sharedLoadError={false}
      />,
    )
    fireEvent.click(within(allByPw('paginated-list-continuation')[0]!).getByRole('button'))
    await screen.findByText('@carol')

    const pageTwoMember = allByPw('household-member-row')[1]!
    fireEvent.click(within(pageTwoMember).getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(allByPw('household-member-name').map(node => node.textContent)).toEqual([
        '@alice',
        '@bob',
        '@carol',
      ]),
    )
  })
})
