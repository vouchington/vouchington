import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  sendInvite: vi.fn<VitestLooseMock>(),
  revokeInvite: vi.fn<VitestLooseMock>(),
}))

// Stub the paginated-list hook so InviteManager renders without network/data.
vi.mock(
  import('@/hooks/use-paginated-list'),
  () =>
    ({
      usePaginatedList: (initialData: unknown) => ({
        pages: [initialData],
        hasNextPage: false,
        loadingMore: false,
        endCursor: null,
        loadMore: vi.fn<VitestLooseMock>(),
        fetchError: null,
        clearError: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('@/hooks/use-paginated-list'),
)

// Stub InfiniteScroll to render only its children.
vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { InviteManager } from '../invite-manager'
import { revokeInvite, sendInvite } from '@/lib/api/client'
import type { CommunityInvite, CommunityInvitesResponseBody } from '@/types/api-responses'

const mockSendInvite = vi.mocked(sendInvite)
const mockRevokeInvite = vi.mocked(revokeInvite)
const mockNav = createNavMock()

function makeInvite(overrides: Partial<CommunityInvite> = {}): CommunityInvite {
  return {
    __entity_type: 'community_invite',
    id: 'invite-1',
    community_id: 'community-1',
    invited_user_id: null,
    invited_email: 'tests+a@voucha.ai',
    invited_by_id: 'user-1',
    accepted_at: null,
    accepted_by_id: null,
    declined_at: null,
    revoked_at: null,
    created_at: '2026-05-24T00:00:00.000Z',
    ...overrides,
  }
}

const baseData: CommunityInvitesResponseBody = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  community_invites: {},
}

describe('InviteManager — keyboard submit convention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockSendInvite.mockResolvedValue({
      community_invite: { ...makeInvite({ id: 'invite-test' }), code: 'one-time-code' },
    })
    mockRevokeInvite.mockResolvedValue(undefined as never)
  })

  it('submits when Enter is pressed in the email input', async () => {
    render(
      <InviteManager
        data={baseData}
        communitySlug='c-slug'
      />,
    )
    const email = screen.getByLabelText(/email address/i) as HTMLInputElement
    fireEvent.change(email, { target: { value: 'tests+a@voucha.ai' } })
    void expectInputEnterSubmits({ input: email, onSubmit: mockSendInvite })
    await waitFor(() => {
      expect(mockSendInvite).toHaveBeenCalledWith('c-slug', {
        email: 'tests+a@voucha.ai',
        username: undefined,
      })
    })
  })

  it('submits when Enter is pressed in the username input', async () => {
    render(
      <InviteManager
        data={baseData}
        communitySlug='c-slug'
      />,
    )
    const username = screen.getByLabelText(/or username/i) as HTMLInputElement
    fireEvent.change(username, { target: { value: 'someuser' } })
    void expectInputEnterSubmits({ input: username, onSubmit: mockSendInvite })
    await waitFor(() => {
      expect(mockSendInvite).toHaveBeenCalledWith('c-slug', {
        email: undefined,
        username: 'someuser',
      })
    })
  })

  it('renders existing invites and revokes a pending invite', async () => {
    render(
      <InviteManager
        data={{
          results: [{ __entity_type: 'community_invite', id: 'invite-1' }],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          community_invites: { 'invite-1': makeInvite() },
        }}
        communitySlug='c-slug'
      />,
    )

    expect(screen.getByText(/^Sent /)).toBeInTheDocument()
    expect(screen.queryByText('code-1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => {
      expect(mockRevokeInvite).toHaveBeenCalledWith('c-slug', 'invite-1')
    })
  })

  it('shows the returned code once and keeps it out of the list callback', async () => {
    const onInviteCreated = vi.fn<(invite: CommunityInvite) => void>()
    mockSendInvite.mockResolvedValueOnce({
      community_invite: { ...makeInvite({ id: 'created-invite' }), code: 'one-time-code' },
    })
    render(
      <InviteManager
        data={baseData}
        communitySlug='c-slug'
        onInviteCreated={onInviteCreated}
      />,
    )
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'tests+a@voucha.ai' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(await screen.findByText('one-time-code')).toBeInTheDocument()
    expect(onInviteCreated).toHaveBeenCalledWith(
      expect.not.objectContaining({ code: 'one-time-code' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('one-time-code')).not.toBeInTheDocument()
  })
})
