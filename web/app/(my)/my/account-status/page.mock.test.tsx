import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))

vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

import AccountStatusPage from './page'

const baseUser = {
  id: 'user-1',
  username: 'alice',
  email_address: 'tests+alice@voucha.ai',
  roles: [],
  suspended_at: null,
  suspended_reason: null,
}

describe('AccountStatusPage', () => {
  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Error('redirect:/login'))
    await expect(AccountStatusPage()).rejects.toThrow('redirect:/login')
  })

  it('renders the page heading when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValueOnce(baseUser)

    render(await AccountStatusPage())

    expect(screen.getByText('Account Status')).toBeVisible()
  })

  it('shows good standing alert when account is not suspended', async () => {
    mockRequireCurrentUser.mockResolvedValueOnce(baseUser)

    render(await AccountStatusPage())

    expect(screen.getByText('Your account is in good standing')).toBeVisible()
  })

  it('shows suspended alert when account is suspended', async () => {
    mockRequireCurrentUser.mockResolvedValueOnce({
      ...baseUser,
      suspended_at: '2026-06-01T00:00:00Z',
      suspended_reason: null,
    })

    render(await AccountStatusPage())

    expect(screen.getByText('Your account has been suspended')).toBeVisible()
    expect(
      screen.getByText('Your account access has been restricted by a moderator.'),
    ).toBeVisible()
  })

  it('shows suspension reason when provided', async () => {
    mockRequireCurrentUser.mockResolvedValueOnce({
      ...baseUser,
      suspended_at: '2026-06-01T00:00:00Z',
      suspended_reason: 'Repeated violations of community guidelines.',
    })

    render(await AccountStatusPage())

    expect(screen.getByText('Repeated violations of community guidelines.')).toBeVisible()
  })

  it('shows appeal dialog trigger when suspended', async () => {
    mockRequireCurrentUser.mockResolvedValueOnce({
      ...baseUser,
      suspended_at: '2026-06-01T00:00:00Z',
      suspended_reason: null,
    })

    render(await AccountStatusPage())

    expect(screen.getByRole('button', { name: 'File an appeal' })).toBeVisible()
  })
})
