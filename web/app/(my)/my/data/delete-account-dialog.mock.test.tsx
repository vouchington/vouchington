import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { DeleteAccountDialog } from './delete-account-dialog'

const { mockDeleteUser, mockOnError, mockRefresh } = vi.hoisted(() => ({
  mockDeleteUser: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockRefresh: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/auth/logout'), () => ({
  logout: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/users'), () => ({
  deleteUser: mockDeleteUser,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

describe('DeleteAccountDialog', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows backend error details when account deletion fails', async () => {
    mockOnError.mockReturnValue('You must transfer organization ownership first')
    mockDeleteUser.mockRejectedValueOnce(
      new ApiError('API request failed: Conflict', 409, {
        error: 'You must transfer organization ownership first',
      }),
    )

    render(<DeleteAccountDialog userId='user-1' />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: 'delete my account' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))

    await waitFor(() => {
      expect(screen.getByText('You must transfer organization ownership first')).toBeInTheDocument()
    })
    expect(mockOnError).toHaveBeenCalledWith(expect.any(ApiError), {
      fallback: 'An unexpected error occurred',
      tags: { form: 'delete-account' },
    })
  })

  it('shows plain text backend errors when account deletion fails', async () => {
    mockOnError.mockReturnValue('No')
    mockDeleteUser.mockRejectedValueOnce(new ApiError('API request failed: Bad Request', 400, 'No'))

    render(<DeleteAccountDialog userId='user-1' />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: 'delete my account' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))

    await waitFor(() => {
      expect(screen.getByText('No')).toBeInTheDocument()
    })
  })
})
