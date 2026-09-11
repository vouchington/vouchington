import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRemove, toastMock } = vi.hoisted(() => ({
  mockRemove: vi.fn<VitestLooseMock>(),
  toastMock: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
}))

vi.mock(import('sonner'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    toast: Object.assign(vi.fn<typeof actual.toast>(), actual.toast, toastMock),
  }
})
vi.mock(import('@/lib/api/client'), () => ({
  createHousehold: vi.fn<VitestLooseMock>(),
  getHouseholdMembershipsClient: vi.fn<VitestLooseMock>(),
  removeHouseholdMembership: mockRemove,
}))

import { HouseholdManager as HouseholdManagerComponent } from '../household-manager'
import type { HouseholdSection } from '@/types/my'
import { allByPw, deferred, makeMembership, makeSection } from '../test-helpers/household-manager'

function HouseholdManager({ initialSections }: { initialSections: HouseholdSection[] }) {
  return (
    <HouseholdManagerComponent
      initialOwnedSection={initialSections[0] ?? null}
      initialSharedPage={{
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }}
      ownedProbeSucceeded
      sharedLoadError={false}
    />
  )
}

describe('HouseholdManager removal rollback', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['first failure first', 'second failure first'])(
    'restores concurrent failed removals in stable original order: %s',
    async failureOrder => {
      const firstFailure = deferred<void>()
      const secondFailure = deferred<void>()
      mockRemove.mockImplementation((_householdId: string, membershipId: string) =>
        membershipId === 'membership-1' ? firstFailure.promise : secondFailure.promise,
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
                makeMembership({
                  id: 'membership-3',
                  individual: { ...makeMembership().individual, username: 'carol' },
                }),
              ],
            }),
          ]}
        />,
      )
      let rows = allByPw('household-member-row')
      fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Remove' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
      rows = allByPw('household-member-row')
      fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Remove' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await act(async () => {
        if (failureOrder === 'first failure first') {
          firstFailure.reject(new Error('first failed'))
          await Promise.resolve()
          secondFailure.reject(new Error('second failed'))
        } else {
          secondFailure.reject(new Error('second failed'))
          await Promise.resolve()
          firstFailure.reject(new Error('first failed'))
        }
      })
      await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(2))
      expect(allByPw('household-member-name').map(node => node.textContent)).toEqual([
        '@alice',
        '@bob',
        '@carol',
      ])
    },
  )
})
