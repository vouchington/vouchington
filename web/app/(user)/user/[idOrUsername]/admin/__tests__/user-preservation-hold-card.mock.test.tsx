import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserPreservationHoldCard } from '../user-preservation-hold-card'
import type { UserPreservationHold } from '@/types/api-responses'

const { mockList, mockPlace, mockRelease, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockList: vi.fn<VitestLooseMock>(),
  mockPlace: vi.fn<VitestLooseMock>(),
  mockRelease: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/preservation-holds'), () => ({
  listUserPreservationHolds: mockList,
  placeUserPreservationHold: mockPlace,
  releaseUserPreservationHold: mockRelease,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: mockToastSuccess, error: mockToastError },
    }) as unknown as typeof import('sonner'),
)

function makeHold(overrides: Partial<UserPreservationHold> = {}): UserPreservationHold {
  return {
    id: 'hold-1',
    account_user_id: 'user-1',
    reference: 'Matter 2026-0042',
    placed_by_id: 'admin-1',
    placed_at: '2026-09-01T00:00:00.000Z',
    released_by_id: null,
    released_at: null,
    ...overrides,
  }
}

function renderCard() {
  return render(<UserPreservationHoldCard userId='user-1' />)
}

describe('UserPreservationHoldCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('places a hold with the trimmed reference and then shows it as open', async () => {
    mockList.mockResolvedValue({ account_deleted_at: null, holds: [] })
    mockPlace.mockResolvedValue({ hold: makeHold() })
    renderCard()

    const place = await screen.findByRole('button', { name: /Place hold/ })
    expect(place).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Matter reference'), {
      target: { value: '  Matter 2026-0042  ' },
    })
    fireEvent.click(place)

    await waitFor(() =>
      expect(mockPlace).toHaveBeenCalledWith('user-1', { reference: 'Matter 2026-0042' }),
    )
    expect(await screen.findByText('Matter 2026-0042')).toBeInTheDocument()
    expect(screen.getByText('Hold open')).toBeInTheDocument()
    expect(mockToastSuccess).toHaveBeenCalledWith('Preservation hold placed.')
    expect(mockToastSuccess).not.toHaveBeenCalledWith(expect.stringContaining('0042'))
    expect(screen.queryByLabelText('Matter reference')).not.toBeInTheDocument()
  })

  it('releases an open hold and keeps it in the history', async () => {
    mockList.mockResolvedValue({ account_deleted_at: null, holds: [makeHold()] })
    mockRelease.mockResolvedValue({
      hold: makeHold({ released_by_id: 'admin-1', released_at: '2026-09-02T00:00:00.000Z' }),
    })
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /Release hold/ }))

    await waitFor(() => expect(mockRelease).toHaveBeenCalledWith('user-1'))
    expect(await screen.findByLabelText('Matter reference')).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getByText('Matter 2026-0042')).toBeInTheDocument()
    expect(screen.getByText('No hold')).toBeInTheDocument()
    expect(mockToastSuccess).toHaveBeenCalledWith('Preservation hold released.')
  })

  it('shows the API error and keeps the entered reference when placing fails', async () => {
    mockList.mockResolvedValue({ account_deleted_at: null, holds: [] })
    mockPlace.mockRejectedValue(new Error('User already has an open preservation hold'))
    renderCard()

    const input = await screen.findByLabelText('Matter reference')
    fireEvent.change(input, { target: { value: 'Matter 9' } })
    fireEvent.click(screen.getByRole('button', { name: /Place hold/ }))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('User already has an open preservation hold'),
    )
    expect(input).toHaveValue('Matter 9')
    expect(input).toBeEnabled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it('shows the fallback error when releasing rejects a non-Error value', async () => {
    mockList.mockResolvedValue({ account_deleted_at: null, holds: [makeHold()] })
    mockRelease.mockRejectedValue('unavailable')
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /Release hold/ }))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to release preservation hold.'),
    )
    expect(screen.getByRole('button', { name: /Release hold/ })).toBeEnabled()
  })

  it('hides the controls when the holds cannot be loaded', async () => {
    mockList.mockRejectedValue(new Error('Forbidden'))
    renderCard()

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Forbidden'))
    expect(screen.getByText('Failed to load preservation holds.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Matter reference')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Place hold/ })).not.toBeInTheDocument()
  })

  it('updates the description when the account was deleted after the page rendered', async () => {
    mockList.mockResolvedValue({
      account_deleted_at: '2026-09-01T00:00:00.000Z',
      holds: [],
    })

    renderCard()

    expect(
      await screen.findByText(
        'While a hold is open, this account’s final purge is paused. Immediate deletion steps are not paused.',
      ),
    ).toBeInTheDocument()
  })
})
