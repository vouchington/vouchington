import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { UserSignalElectionCard } from '../user-signal-election-card'

const mockOpenEmailVerificationRecovery = vi.fn<VitestLooseMock>()

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/email-verification-recovery-context'), async importOriginal => ({
  ...(await importOriginal()),
  useEmailVerificationRecovery: () => ({
    openEmailVerificationRecovery: mockOpenEmailVerificationRecovery,
  }),
}))

const actions = [
  {
    choice: 'vouch' as const,
    label: 'Approve',
    ariaLabel: 'Approve profile',
    tooltip: 'Approve this profile',
    successMessage: 'Approved.',
    icon: Check,
  },
  {
    choice: 'disavow' as const,
    label: 'Reject',
    ariaLabel: 'Reject profile',
    tooltip: 'Reject this profile',
    successMessage: 'Rejected.',
    icon: X,
    variant: 'destructive' as const,
  },
] as const

describe('UserSignalElectionCard', () => {
  beforeEach(() => {
    mockOpenEmailVerificationRecovery.mockReset()
    vi.mocked(toast.error).mockReset()
    vi.mocked(toast.success).mockReset()
  })

  it('renders configured copy, actions, and data-pw', () => {
    const { container } = render(
      <UserSignalElectionCard
        userId='user-1'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        errorMessage='Could not save.'
        actions={actions}
        data-pw='signal-card'
      />,
    )

    expect(container.querySelector('[data-pw="signal-card"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="user-signal-vote-choice"][data-vote-choice="vouch"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-pw="user-signal-vote-choice"][data-vote-choice="disavow"]'),
    ).not.toBeNull()
    expect(screen.getByText('Signal Check')).toBeDefined()
    expect(screen.getByText('Choose a signal.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Approve profile' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reject profile' })).toBeDefined()
  })

  it('submits the configured choice and success toast', async () => {
    const submitVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <UserSignalElectionCard
        userId='user-1'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={submitVote}
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reject profile' }))

    await waitFor(() => {
      expect(submitVote).toHaveBeenCalledWith('user-1', 'disavow')
      expect(toast.success).toHaveBeenCalledWith('Rejected.')
    })
  })

  it('hydrates the current ballot and hides public Clear', () => {
    render(
      <UserSignalElectionCard
        userId='user-1'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        clearVote={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        initialChoice='vouch'
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    expect(screen.getByRole('button', { name: 'Approve profile' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it.each([
    {
      name: 'opens email verification recovery',
      error: Object.assign(new Error('Verify your email'), { code: 'EMAIL_VERIFICATION_REQUIRED' }),
      recoveryCalls: 1,
      errorCalls: [],
    },
    {
      name: 'shows the configured error',
      error: new Error('nope'),
      recoveryCalls: 0,
      errorCalls: [['Could not save.']],
    },
  ])(
    'rolls back the choice when clearing fails and $name',
    async ({ error, recoveryCalls, errorCalls }) => {
      const clearVote = vi.fn<VitestLooseMock>().mockRejectedValue(error)
      render(
        <UserSignalElectionCard
          userId='user-1'
          title='Signal Check'
          description='Choose a signal.'
          submitVote={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
          clearVote={clearVote}
          initialChoice='vouch'
          canCreateTrustSignal={false}
          errorMessage='Could not save.'
          actions={actions}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

      await waitFor(() => expect(clearVote).toHaveBeenCalledWith('user-1'))
      expect(screen.getByRole('button', { name: 'Approve profile' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(mockOpenEmailVerificationRecovery).toHaveBeenCalledTimes(recoveryCalls)
      expect(vi.mocked(toast.error).mock.calls).toEqual(errorCalls)
    },
  )

  it('resets the hydrated choice and mutation target when the rendered profile changes', async () => {
    const firstClearVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const secondClearVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const secondSubmitVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const { rerender } = render(
      <UserSignalElectionCard
        userId='user-1'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        clearVote={firstClearVote}
        initialChoice='vouch'
        canCreateTrustSignal={false}
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    rerender(
      <UserSignalElectionCard
        userId='user-2'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={secondSubmitVote}
        clearVote={secondClearVote}
        initialChoice='disavow'
        canCreateTrustSignal={false}
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    expect(screen.getByRole('button', { name: 'Reject profile' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(secondClearVote).toHaveBeenCalledWith('user-2'))
    expect(firstClearVote).not.toHaveBeenCalled()

    rerender(
      <UserSignalElectionCard
        userId='user-3'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={secondSubmitVote}
        clearVote={secondClearVote}
        initialChoice={null}
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve profile' }))
    await waitFor(() => expect(secondSubmitVote).toHaveBeenCalledWith('user-3', 'vouch'))
  })

  it('lets an official account clear an existing ballot without creating another one', () => {
    render(
      <UserSignalElectionCard
        userId='user-1'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        clearVote={vi.fn<VitestLooseMock>().mockResolvedValue(undefined)}
        initialChoice='vouch'
        canCreateTrustSignal={false}
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    expect(screen.getByRole('button', { name: 'Approve profile' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject profile' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled()
  })

  it('shows the configured error toast when submission fails', async () => {
    const submitVote = vi.fn<VitestLooseMock>().mockRejectedValue(new Error('nope'))
    render(
      <UserSignalElectionCard
        userId='user-1'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={submitVote}
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Approve profile' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not save.')
    })
  })

  it('opens email verification recovery and rolls back the optimistic choice', async () => {
    const submitVote = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(
        Object.assign(new Error('Verify your email'), { code: 'EMAIL_VERIFICATION_REQUIRED' }),
      )
    render(
      <UserSignalElectionCard
        userId='user-1'
        title='Signal Check'
        description='Choose a signal.'
        submitVote={submitVote}
        initialChoice='disavow'
        errorMessage='Could not save.'
        actions={actions}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Approve profile' }))

    await waitFor(() => expect(mockOpenEmailVerificationRecovery).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Reject profile' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(toast.error).not.toHaveBeenCalledWith('Could not save.')
  })
})
