import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetMyWarnings, mockRequireCurrentUser, mockMyWarningsClient } = vi.hoisted(() => ({
  mockGetMyWarnings: vi.fn<VitestLooseMock>(),
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockMyWarningsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMyWarnings: mockGetMyWarnings,
}))

vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(import('./my-warnings-client'), () => ({
  MyWarningsClient: (props: { warnings: unknown[] }) => {
    mockMyWarningsClient(props)
    return <div data-pw='my-warnings-client' />
  },
}))

import MyWarningsPage from './page'

const baseUser = {
  id: 'user-1',
  username: 'alice',
  email_address: 'tests+alice@voucha.ai',
  roles: [],
}
const emptyResponse = {
  warnings: [],
  page_info: { has_next_page: false, end_cursor: null },
}
const responseWithWarning = {
  warnings: [
    {
      id: 'warning-1',
      user_id: 'user-1',
      community_id: 'community-1',
      issued_by_id: 'moderator-1',
      issued_by_username: 'moderator',
      reason: 'Internal reason stays server-side',
      report_id: 'report-1',
      public_message: 'Visible message',
      created_at: '2026-05-31T00:00:00.000Z',
      community_slug: 'credit-cards',
    },
  ],
  page_info: { has_next_page: true, end_cursor: 'next-cursor' },
}

describe('MyWarningsPage', () => {
  beforeEach(() => {
    mockGetMyWarnings.mockReset()
    mockRequireCurrentUser.mockReset()
    mockMyWarningsClient.mockReset()
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Error('redirect:/login'))

    await expect(MyWarningsPage()).rejects.toThrow('redirect:/login')

    expect(mockGetMyWarnings).not.toHaveBeenCalled()
  })

  it('renders the page heading when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetMyWarnings.mockResolvedValueOnce(emptyResponse)

    render(await MyWarningsPage())

    expect(screen.getByText('My Warnings')).toBeVisible()
  })

  it('renders the warnings client component', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetMyWarnings.mockResolvedValueOnce(emptyResponse)

    const { container } = render(await MyWarningsPage())

    expect(container.querySelector('[data-pw="my-warnings-client"]')).not.toBeNull()
  })

  it('passes only the warnings view model across the client boundary', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetMyWarnings.mockResolvedValueOnce(responseWithWarning)

    render(await MyWarningsPage())

    const props = mockMyWarningsClient.mock.lastCall?.[0] as { warnings: Record<string, unknown>[] }
    expect(Object.keys(props)).toEqual(['warnings'])
    expect(Object.keys(props.warnings[0]!)).toEqual([
      'id',
      'communitySlug',
      'createdAt',
      'publicMessage',
    ])
    expect(props.warnings[0]).toEqual({
      id: 'warning-1',
      communitySlug: 'credit-cards',
      createdAt: '2026-05-31T00:00:00.000Z',
      publicMessage: 'Visible message',
    })
  })
})
