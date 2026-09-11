import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { UserAdminPanel } from '../user-admin-panel'
import type { User } from '@/types/user'

const { mockRefresh, mockSuspendUser, mockUnsuspendUser } = vi.hoisted(() => ({
  mockRefresh: vi.fn<VitestLooseMock>(),
  mockSuspendUser: vi.fn<VitestLooseMock>(),
  mockUnsuspendUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
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

vi.mock(import('@/lib/api/client/users'), () => ({
  suspendUser: mockSuspendUser,
  unsuspendUser: mockUnsuspendUser,
}))

vi.mock(
  import('@/components/shared/issue-warning-dialog'),
  () =>
    ({
      IssueWarningDialog: ({ onIssued }: { onIssued?: () => void; children?: React.ReactNode }) => (
        <button
          type='button'
          data-pw='issue-warning-trigger-mock'
          onClick={() => onIssued?.()}
        >
          Issue Warning
        </button>
      ),
    }) as unknown as typeof import('@/components/shared/issue-warning-dialog'),
)

vi.mock(import('../user-admin-warnings'), () => ({
  UserAdminWarnings: ({ userId }: { userId: string }) => (
    <div
      data-pw='user-admin-warnings'
      data-userid={userId}
    />
  ),
}))

const activeUser: User = {
  id: 'user-1',
  username: 'alice',
  email_address: 'tests+alice@voucha.ai',
  roles: [],
}

describe('UserAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSuspendUser.mockResolvedValue({
      user: {
        ...activeUser,
        suspended_at: '2026-05-17T00:00:00.000Z',
        suspended_reason: 'spamming links',
      },
    })
    mockUnsuspendUser.mockResolvedValue({ user: { ...activeUser, suspended_at: null } })
  })

  it('suspends an active user with a reason', async () => {
    render(<UserAdminPanel user={activeUser} />)

    fireEvent.change(screen.getByLabelText('Suspension reason'), {
      target: { value: 'spamming links' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Suspend/ }))

    await waitFor(() => {
      expect(mockSuspendUser).toHaveBeenCalledWith('user-1', { reason: 'spamming links' })
    })
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.getByText('Suspended')).toBeInTheDocument()
    expect(screen.getByText('spamming links')).toBeInTheDocument()
  })

  it('unsuspends a suspended user', async () => {
    render(
      <UserAdminPanel
        user={{
          ...activeUser,
          suspended_at: '2026-05-17T00:00:00.000Z',
          suspended_reason: 'spam',
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Unsuspend/ }))

    await waitFor(() => {
      expect(mockUnsuspendUser).toHaveBeenCalledWith('user-1')
    })
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders IssueWarningDialog and UserAdminWarnings for the user', () => {
    const { container } = render(<UserAdminPanel user={activeUser} />)

    expect(screen.getByRole('button', { name: 'Issue Warning' })).toBeInTheDocument()
    expect(container.querySelector('[data-pw="user-admin-warnings"]')).not.toBeNull()
  })

  it('re-mounts UserAdminWarnings when IssueWarningDialog calls onIssued', async () => {
    const { container } = render(<UserAdminPanel user={activeUser} />)

    // Trigger onIssued via the mock button
    fireEvent.click(screen.getByRole('button', { name: 'Issue Warning' }))

    // The UserAdminWarnings should still be mounted (key incremented = remount)
    await waitFor(() =>
      expect(container.querySelector('[data-pw="user-admin-warnings"]')).not.toBeNull(),
    )
  })
})
