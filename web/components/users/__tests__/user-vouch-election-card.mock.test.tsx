import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { UserVouchElectionCard } from '../user-vouch-election-card'

const mockNav = createNavMock()

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

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

describe('UserVouchElectionCard', () => {
  beforeEach(() => {
    mockNav.reset()
    vi.mocked(toast.error).mockReset()
    vi.mocked(toast.success).mockReset()
  })

  it('renders the vouch-check card without public vote counts', () => {
    const { container } = render(
      <UserVouchElectionCard
        userId='user-1'
        displayName='Example User'
        data-pw='vouch-card'
      />,
    )

    expect(container.querySelector('[data-pw="vouch-card"]')).not.toBeNull()
    expect(screen.getByText('Vouch Check')).toBeDefined()
    expect(screen.getByText('Do you trust Example User?')).toBeDefined()
    const vouchButton = screen.getByRole('button', { name: 'Vouch for Example User' })
    expect(vouchButton).toBeDefined()
    expect(screen.getByRole('button', { name: 'Like' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Neutral' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dislike' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Disavow Example User' })).toBeDefined()
    expect(vouchButton.parentElement).toHaveClass('flex-wrap')
  })

  it('submits the vouch choice and marks it selected', async () => {
    const submitVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

    render(
      <UserVouchElectionCard
        userId='user-1'
        displayName='Example User'
        submitVote={submitVote}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Vouch for Example User' }))

    await waitFor(() => {
      expect(submitVote).toHaveBeenCalledWith('user-1', 'vouch')
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Vouched for Example User.')
    })
  })

  it('submits the disavow choice with unfollow+mute toast', async () => {
    const submitVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

    render(
      <UserVouchElectionCard
        userId='user-1'
        displayName='Example User'
        submitVote={submitVote}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disavow Example User' }))

    await waitFor(() => {
      expect(submitVote).toHaveBeenCalledWith('user-1', 'disavow')
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Disavowed Example User, unfollowed and muted.')
    })
    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('retracts a locally selected choice through Neutral', async () => {
    const submitVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const clearVote = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <UserVouchElectionCard
        userId='user-1'
        displayName='Example User'
        submitVote={submitVote}
        clearVote={clearVote}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vouch for Example User' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Vouch for Example User' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Neutral' }))
    await waitFor(() => expect(submitVote).toHaveBeenCalledWith('user-1', 'neutral'))
    expect(clearVote).not.toHaveBeenCalled()
    expect(mockNav.refresh).not.toHaveBeenCalled()
  })

  it('shows an error toast when submission fails', async () => {
    const submitVote = vi.fn<VitestLooseMock>().mockRejectedValue(new Error('boom'))

    render(
      <UserVouchElectionCard
        userId='user-1'
        displayName='Example User'
        submitVote={submitVote}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disavow Example User' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update vouch vote. Please try again.')
    })
    expect(mockNav.refresh).not.toHaveBeenCalled()
  })

  it('does not refresh after email verification interrupts disavow', async () => {
    const submitVote = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(
        Object.assign(new Error('Verify your email'), { code: 'EMAIL_VERIFICATION_REQUIRED' }),
      )

    render(
      <UserVouchElectionCard
        userId='user-1'
        displayName='Example User'
        submitVote={submitVote}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disavow Example User' }))

    await waitFor(() => expect(submitVote).toHaveBeenCalledWith('user-1', 'disavow'))
    expect(mockNav.refresh).not.toHaveBeenCalled()
  })

  it('disables both buttons while a submission is in flight', async () => {
    let resolveSubmit: () => void = () => {}
    const submitVote = vi.fn<VitestLooseMock>(
      () =>
        new Promise<void>(resolve => {
          resolveSubmit = resolve
        }),
    )

    render(
      <UserVouchElectionCard
        userId='user-1'
        displayName='Example User'
        submitVote={submitVote}
      />,
    )

    const vouchButton = screen.getByRole('button', { name: 'Vouch for Example User' })
    const disavowButton = screen.getByRole('button', { name: 'Disavow Example User' })

    fireEvent.click(vouchButton)

    await waitFor(() => {
      expect(vouchButton).toBeDisabled()
      expect(disavowButton).toBeDisabled()
    })

    resolveSubmit()

    await waitFor(() => {
      expect(vouchButton).not.toBeDisabled()
      expect(disavowButton).not.toBeDisabled()
    })
  })
})
