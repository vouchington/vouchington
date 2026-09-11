import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { UserActionsAside } from '../user-actions-aside'

const mockEntityBookmarkButton = vi.hoisted(() => vi.fn<VitestLooseMock>())
let mockCurrentUserId = 'viewer-1'

vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: (props: Record<string, unknown>) => mockEntityBookmarkButton(props),
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
)

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: { id: mockCurrentUserId },
        isAuthenticated: true,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: { id: string } | null) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('@/components/shared/report-dialog'),
  () =>
    ({
      ReportDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid='report-dialog' /> : null,
    }) as unknown as typeof import('@/components/shared/report-dialog'),
)

vi.mock(
  import('@/lib/api/client/reports'),
  () =>
    ({
      submitReport: vi.fn<VitestLooseMock>().mockResolvedValue({ report: { id: 'r1' } }),
      REPORT_REASONS: [{ value: 'spam', label: 'Spam' }],
    }) as unknown as typeof import('@/lib/api/client/reports'),
)

describe('UserActionsAside', () => {
  beforeEach(() => {
    mockEntityBookmarkButton.mockReset()
    mockCurrentUserId = 'viewer-1'
  })

  it('configures subscribe, mute, and block bookmark actions', () => {
    mockEntityBookmarkButton.mockReturnValue(<button type='button'>Action</button>)

    render(<UserActionsAside userId='user-1' />)

    expect(mockEntityBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'user',
        entityId: 'user-1',
        preset: 'subscribe',
        inactiveLabel: 'Subscribe to Posts',
        activeLabel: 'Subscribed to Posts',
      }),
    )
    expect(mockEntityBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'user',
        entityId: 'user-1',
        preset: 'mute',
        size: 'touchSm',
        tooltip: 'Hide this user from your feed',
      }),
    )
    expect(mockEntityBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'user',
        entityId: 'user-1',
        preset: 'block',
        size: 'touchSm',
        tooltip: 'Block this user from interacting with you',
      }),
    )
  })

  it('does not render self-targeted actions', () => {
    mockCurrentUserId = 'user-1'
    mockEntityBookmarkButton.mockReturnValue(<button type='button'>Action</button>)

    const { container } = render(<UserActionsAside userId='user-1' />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders action buttons inside a group container', () => {
    mockEntityBookmarkButton.mockReturnValue(<button type='button'>Action</button>)
    const { container } = render(<UserActionsAside userId='user-1' />)
    const group = container.querySelector('[role="group"]')
    expect(group).not.toBeNull()
  })
})
