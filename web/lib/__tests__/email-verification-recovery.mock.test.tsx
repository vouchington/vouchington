import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEmailVerificationRecovery } from '../email-verification-recovery-context'
import { EmailVerificationRecoveryProvider } from '../email-verification-recovery'

const { toastSuccessMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () => ({ toast: { success: toastSuccessMock } }) as unknown as typeof import('sonner'),
)
vi.mock(
  import('@/components/my/email-verification-recovery-dialog'),
  () =>
    ({
      EmailVerificationRecoveryDialog: ({
        onVerified,
        open,
      }: {
        onVerified: () => void
        open: boolean
      }) =>
        open ? (
          <button
            type='button'
            onClick={onVerified}
          >
            Complete verification
          </button>
        ) : null,
    }) as unknown as typeof import('@/components/my/email-verification-recovery-dialog'),
)

function RecoveryConsumer({ onVerified }: { onVerified?: () => void }) {
  const { openEmailVerificationRecovery } = useEmailVerificationRecovery()!
  return (
    <button
      type='button'
      onClick={() => openEmailVerificationRecovery({ onVerified })}
    >
      Recover
    </button>
  )
}

describe('EmailVerificationRecoveryProvider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens recovery, reports success, and invokes the completion callback once', () => {
    const onVerified = vi.fn<VitestLooseMock>()
    render(
      <EmailVerificationRecoveryProvider>
        <RecoveryConsumer onVerified={onVerified} />
      </EmailVerificationRecoveryProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete verification' }))

    expect(toastSuccessMock).toHaveBeenCalledWith('Email verified. Try your action again.')
    expect(onVerified).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Complete verification' })).toBeNull()
  })

  it('allows recovery without a completion callback', () => {
    render(
      <EmailVerificationRecoveryProvider>
        <RecoveryConsumer />
      </EmailVerificationRecoveryProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Recover' }))
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Complete verification' })),
    ).not.toThrow()
  })
})
