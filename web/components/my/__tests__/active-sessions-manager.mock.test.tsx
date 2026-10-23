import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'

const mockNav = createNavMock()

const { mockDeleteSession, mockRevokeSessions, mockRevokeGrant } = vi.hoisted(() => ({
  mockDeleteSession: vi.fn<VitestLooseMock>(),
  mockRevokeSessions: vi.fn<VitestLooseMock>(),
  mockRevokeGrant: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client'), () => ({
  deleteAuthSession: mockDeleteSession,
  revokeAuthSessions: mockRevokeSessions,
}))
vi.mock(import('@/lib/api/client/oauth-grants'), () => ({
  revokeOAuthGrant: mockRevokeGrant,
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

import { ActiveSessionsManager } from '../active-sessions-manager'
import type { AuthSession } from '@/types/my'

const initialSessions: AuthSession[] = [
  {
    id: 'session-1',
    device_id: 'device-1',
    device_name: 'My laptop',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    ip_address: '203.0.113.10',
    created_at: '2026-07-01T12:00:00Z',
    last_seen_at: '2026-07-06T10:00:00Z',
    expires_at: '2026-08-01T12:00:00Z',
    is_current: true,
    mcp_connections: [
      {
        grant_id: 'grant-1',
        client_name: 'Voucha macOS',
        attestation_status: 'attested',
        last_minted_at: '2026-07-06T10:00:00Z',
      },
    ],
  },
  {
    id: 'session-2',
    device_id: 'device-2',
    device_name: 'Work browser',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ip_address: '198.51.100.18',
    created_at: '2026-06-30T12:00:00Z',
    last_seen_at: '2026-07-05T09:30:00Z',
    expires_at: '2026-07-30T12:00:00Z',
    is_current: false,
    mcp_connections: [
      {
        grant_id: 'grant-2',
        client_name: 'Voucha Windows',
        attestation_status: 'unattested',
        last_minted_at: '2026-07-05T09:30:00Z',
      },
    ],
  },
]

describe('ActiveSessionsManager', () => {
  beforeEach(() => {
    mockNav.reset()
    mockDeleteSession.mockReset()
    mockRevokeSessions.mockReset()
    mockRevokeGrant.mockReset()
    mockDeleteSession.mockResolvedValue(undefined)
    mockRevokeSessions.mockResolvedValue(undefined)
    mockRevokeGrant.mockResolvedValue(undefined)
  })

  it('renders the active sessions list with the current device badge', () => {
    render(<ActiveSessionsManager initialSessions={initialSessions} />)

    expect(screen.getByRole('heading', { name: 'Active sessions' })).toBeInTheDocument()
    expect(screen.getByText('My laptop')).toBeInTheDocument()
    expect(screen.getByText('Work browser')).toBeInTheDocument()
    expect(screen.getByText('This device')).toBeInTheDocument()
  })

  it('signs out a single non-current session without routing away', async () => {
    render(<ActiveSessionsManager initialSessions={initialSessions} />)

    const row = screen.getByText('Work browser').closest('li')
    expect(row).toBeTruthy()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Sign out' }))
    expect(mockDeleteSession).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out session' }))

    await waitFor(() => {
      expect(mockDeleteSession).toHaveBeenCalledWith('session-2')
      expect(screen.queryByText('Work browser')).not.toBeInTheDocument()
    })
    expect(mockNav.replace).not.toHaveBeenCalled()
  })

  it('routes to login after signing out the current session', async () => {
    render(<ActiveSessionsManager initialSessions={initialSessions} />)

    const row = screen.getByText('My laptop').closest('li')
    expect(row).toBeTruthy()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Sign out' }))
    expect(mockDeleteSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out session' }))

    await waitFor(() => {
      expect(mockDeleteSession).toHaveBeenCalledWith('session-1')
      expect(mockNav.replace).toHaveBeenCalledWith('/login')
    })
  })

  it('routes to login after signing out all devices', async () => {
    render(<ActiveSessionsManager initialSessions={initialSessions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out all devices' }))
    expect(mockRevokeSessions).not.toHaveBeenCalled()
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Sign out all devices',
      }),
    )

    await waitFor(() => {
      expect(mockRevokeSessions).toHaveBeenCalledOnce()
      expect(mockNav.replace).toHaveBeenCalledWith('/login')
    })
  })

  it('shows each MCP connection under its session and revokes only its grant after confirmation', async () => {
    render(<ActiveSessionsManager initialSessions={initialSessions} />)

    const currentRow = screen.getByText('My laptop').closest('li')!
    const otherRow = screen.getByText('Work browser').closest('li')!
    expect(within(currentRow).getByText('Voucha macOS')).toBeInTheDocument()
    expect(within(currentRow).getByText('Attested')).toBeInTheDocument()
    expect(within(otherRow).getByText('Voucha Windows')).toBeInTheDocument()
    expect(within(otherRow).getByText('Unattested')).toBeInTheDocument()

    fireEvent.click(within(currentRow).getByRole('button', { name: 'Revoke MCP access' }))
    expect(mockRevokeGrant).not.toHaveBeenCalled()
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke MCP access' }),
    )

    await waitFor(() => {
      expect(mockRevokeGrant).toHaveBeenCalledWith('grant-1')
      expect(within(currentRow).queryByText('Voucha macOS')).not.toBeInTheDocument()
    })
    expect(screen.getByText('My laptop')).toBeInTheDocument()
    expect(within(otherRow).getByText('Voucha Windows')).toBeInTheDocument()
    expect(mockDeleteSession).not.toHaveBeenCalled()
    expect(mockNav.replace).not.toHaveBeenCalled()
  })

  it('keeps the MCP connection visible when grant revocation fails', async () => {
    mockRevokeGrant.mockRejectedValueOnce(new Error('failed'))
    render(<ActiveSessionsManager initialSessions={initialSessions} />)

    const row = screen.getByText('My laptop').closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Revoke MCP access' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke MCP access' }),
    )

    await waitFor(() => expect(mockRevokeGrant).toHaveBeenCalledWith('grant-1'))
    expect(within(row).getByText('Voucha macOS')).toBeInTheDocument()
    expect(mockDeleteSession).not.toHaveBeenCalled()
  })
})
