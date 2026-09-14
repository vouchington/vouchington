import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetMemberships, mockRemove, toastMock } = vi.hoisted(() => ({
  mockGetMemberships: vi.fn<VitestLooseMock>(),
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
  getHouseholdMembershipsClient: mockGetMemberships,
  removeHouseholdMembership: mockRemove,
}))

import { HouseholdManager as HouseholdManagerComponent } from '../household-manager'
import type { HouseholdSection } from '@/types/my'
import {
  deferred,
  makeMembership,
  makeSection,
} from '../../../test-helpers/components/my/household-manager'

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

describe('HouseholdManager membership races', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not resurrect a removed member from a membership request started before deletion', async () => {
    const load = deferred<{
      results: ReturnType<typeof makeMembership>[]
      page_info: { has_next_page: false; start_cursor: null; end_cursor: null }
    }>()
    mockGetMemberships.mockReturnValueOnce(load.promise)
    mockRemove.mockResolvedValueOnce(undefined)
    render(<HouseholdManager initialSections={[makeSection({ membershipLoadError: true })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(1))

    await act(async () =>
      load.resolve({
        results: [makeMembership()],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }),
    )

    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retrying...' })).not.toBeInTheDocument()
  })

  it('restores a failed deletion while ignoring the older membership response', async () => {
    const load = deferred<{
      results: ReturnType<typeof makeMembership>[]
      page_info: { has_next_page: false; start_cursor: null; end_cursor: null }
    }>()
    const removal = deferred<void>()
    mockGetMemberships.mockReturnValueOnce(load.promise)
    mockRemove.mockReturnValueOnce(removal.promise)
    render(<HouseholdManager initialSections={[makeSection({ membershipLoadError: true })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await act(async () => removal.reject(new Error('delete failed')))
    await act(async () =>
      load.resolve({
        results: [
          makeMembership({ individual: { ...makeMembership().individual, username: 'stale' } }),
        ],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }),
    )

    expect(screen.getByText('@alice')).toBeVisible()
    expect(screen.queryByText('@stale')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retrying...' })).not.toBeInTheDocument()
  })

  it('ignores a membership request started during a successful deletion', async () => {
    const load = deferred<{
      results: ReturnType<typeof makeMembership>[]
      page_info: { has_next_page: false; start_cursor: null; end_cursor: null }
    }>()
    const removal = deferred<void>()
    mockGetMemberships.mockReturnValueOnce(load.promise)
    mockRemove.mockReturnValueOnce(removal.promise)
    render(<HouseholdManager initialSections={[makeSection({ membershipLoadError: true })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => removal.resolve())
    await act(async () =>
      load.resolve({
        results: [makeMembership()],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }),
    )

    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retrying...' })).not.toBeInTheDocument()
  })

  it('restores once when a deletion fails after a during-delete membership response', async () => {
    const load = deferred<{
      results: ReturnType<typeof makeMembership>[]
      page_info: { has_next_page: false; start_cursor: null; end_cursor: null }
    }>()
    const removal = deferred<void>()
    mockGetMemberships.mockReturnValueOnce(load.promise)
    mockRemove.mockReturnValueOnce(removal.promise)
    render(<HouseholdManager initialSections={[makeSection({ membershipLoadError: true })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () =>
      load.resolve({
        results: [makeMembership()],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }),
    )
    expect(screen.queryByText('@alice')).not.toBeInTheDocument()
    await act(async () => removal.reject(new Error('delete failed')))

    expect(screen.getAllByText('@alice')).toHaveLength(1)
  })
})
