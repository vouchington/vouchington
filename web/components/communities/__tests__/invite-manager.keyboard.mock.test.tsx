import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>(), refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
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
import type { CommunityInvitesResponseBody } from '@/types/api-responses'

const mockSendInvite = vi.mocked(sendInvite)
const mockRevokeInvite = vi.mocked(revokeInvite)

const baseData: CommunityInvitesResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null },
  community_invites: {},
} as unknown as CommunityInvitesResponseBody

describe('InviteManager — keyboard submit convention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInvite.mockResolvedValue(undefined as never)
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
        data={
          {
            results: [{ __entity_type: 'community_invite', id: 'invite-1' }],
            page_info: { has_next_page: false, end_cursor: null },
            community_invites: {
              'invite-1': {
                id: 'invite-1',
                code: 'code-1',
                community_id: 'community-1',
                created_at: '2026-05-24T00:00:00.000Z',
                created_by_id: 'user-1',
                invited_email: 'tests+a@voucha.ai',
                invited_user_id: null,
                accepted_at: null,
                declined_at: null,
                revoked_at: null,
              },
            },
          } as unknown as CommunityInvitesResponseBody
        }
        communitySlug='c-slug'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => {
      expect(mockRevokeInvite).toHaveBeenCalledWith('c-slug', 'invite-1')
    })
  })
})
