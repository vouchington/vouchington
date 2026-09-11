import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterRefresh, mockUnlink, mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn<VitestLooseMock>(),
  mockUnlink: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRouterRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/referral-link-validations'), () => ({
  unlinkValidationFromReferralProgram: mockUnlink,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

vi.mock(
  import('@/components/ui/alert-dialog'),
  () =>
    ({
      AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
        open ? <div>{children}</div> : null,
      AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
        <button
          type='button'
          onClick={onClick}
        >
          {children}
        </button>
      ),
      AlertDialogCancel: ({ children }: { children: ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/alert-dialog'),
)

import { UnlinkValidationButton } from '../unlink-validation-button'

describe('UnlinkValidationButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnlink.mockResolvedValue(undefined)
  })

  it('renders the Unlink button', () => {
    render(
      <UnlinkValidationButton
        referralProgramId='prog-1'
        validationId='val-1'
        slug='chase-sapphire'
      />,
    )
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument()
  })

  it('shows confirmation dialog when Unlink is clicked', () => {
    render(
      <UnlinkValidationButton
        referralProgramId='prog-1'
        validationId='val-1'
        slug='chase-sapphire'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(screen.getByText('Unlink validation?')).toBeInTheDocument()
  })

  it('calls unlinkValidationFromReferralProgram and router.refresh on confirm', async () => {
    render(
      <UnlinkValidationButton
        referralProgramId='prog-1'
        validationId='val-1'
        slug='chase-sapphire'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    // The confirm dialog has an "Unlink" action button
    const buttons = screen.getAllByRole('button', { name: 'Unlink' })
    // The last Unlink button is the confirm action inside the dialog
    fireEvent.click(buttons.at(-1)!)

    await waitFor(() => {
      expect(mockUnlink).toHaveBeenCalledWith('prog-1', 'val-1')
      expect(mockOnSuccess).toHaveBeenCalledWith('Unlinked validation "chase-sapphire"')
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it('calls onError when unlinkValidationFromReferralProgram rejects', async () => {
    mockUnlink.mockRejectedValueOnce(new Error('Server error'))

    render(
      <UnlinkValidationButton
        referralProgramId='prog-1'
        validationId='val-1'
        slug='chase-sapphire'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    const buttons = screen.getAllByRole('button', { name: 'Unlink' })
    fireEvent.click(buttons.at(-1)!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to unlink validation' }),
      )
    })
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })
})
