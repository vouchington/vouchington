import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configure, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

configure({ testIdAttribute: 'data-pw' })

const mockFetchCommunityPinnedPosts = vi.fn<VitestLooseMock>()
const mockSetCommunityPinnedPosts = vi.fn<VitestLooseMock>()
const mockRefresh = vi.fn<VitestLooseMock>()
const mockToastSuccess = vi.fn<VitestLooseMock>()
const mockToastError = vi.fn<VitestLooseMock>()

vi.mock(import('@/lib/api/client/communities'), () => ({
  fetchCommunityPinnedPosts: (...args: unknown[]) => mockFetchCommunityPinnedPosts(...args),
  setCommunityPinnedPosts: (...args: unknown[]) => mockSetCommunityPinnedPosts(...args),
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
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Pin: () => <svg data-pw='pin-icon' />,
    PinOff: () => <svg data-pw='pin-off-icon' />,
  }),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenuItem: ({
        children,
        onSelect,
        disabled,
        'data-pw': dataPw,
      }: {
        children: ReactNode
        onSelect?: (e: Event) => void
        disabled?: boolean
        'data-pw'?: string
      }) => (
        <button
          type='button'
          role='menuitem'
          disabled={disabled}
          data-pw={dataPw}
          onClick={() => onSelect?.(new Event('select'))}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

import { PinCommunityPostMenuItem } from '../pin-community-post-menu-item'

const defaultProps = {
  postId: 'post-1',
  communitySlug: 'my-community',
  isPinned: false,
}

describe('PinCommunityPostMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetCommunityPinnedPosts.mockResolvedValue({ pinned_posts: [] })
  })

  it('renders pin action when not pinned', () => {
    render(<PinCommunityPostMenuItem {...defaultProps} />)
    expect(screen.getByTestId('pin-community-post-menu-item')).toBeDefined()
  })

  it('renders unpin action when pinned', () => {
    render(
      <PinCommunityPostMenuItem
        {...defaultProps}
        isPinned
      />,
    )
    expect(screen.getByTestId('unpin-community-post-menu-item')).toBeDefined()
  })

  it('pins a post and calls router.refresh', async () => {
    mockFetchCommunityPinnedPosts.mockResolvedValue({ pinned_posts: [] })

    render(<PinCommunityPostMenuItem {...defaultProps} />)
    fireEvent.click(screen.getByRole('menuitem'))

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Post pinned to community.'))
    expect(mockSetCommunityPinnedPosts).toHaveBeenCalledWith('my-community', ['post-1'])
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('unpins a post and calls router.refresh', async () => {
    mockFetchCommunityPinnedPosts.mockResolvedValue({
      pinned_posts: [{ post_id: 'post-1' }, { post_id: 'post-2' }],
    })

    render(
      <PinCommunityPostMenuItem
        {...defaultProps}
        isPinned
      />,
    )
    fireEvent.click(screen.getByRole('menuitem'))

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Post unpinned from community.'),
    )
    expect(mockSetCommunityPinnedPosts).toHaveBeenCalledWith('my-community', ['post-2'])
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows error toast when already at max pins', async () => {
    mockFetchCommunityPinnedPosts.mockResolvedValue({
      pinned_posts: [{ post_id: 'p1' }, { post_id: 'p2' }, { post_id: 'p3' }],
    })

    render(<PinCommunityPostMenuItem {...defaultProps} />)
    fireEvent.click(screen.getByRole('menuitem'))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('You can pin at most 3 posts. Unpin one first.'),
    )
    expect(mockSetCommunityPinnedPosts).not.toHaveBeenCalled()
  })

  it('skips API call and refreshes when post is already in pinned list', async () => {
    mockFetchCommunityPinnedPosts.mockResolvedValue({
      pinned_posts: [{ post_id: 'post-1' }],
    })

    render(<PinCommunityPostMenuItem {...defaultProps} />)
    fireEvent.click(screen.getByRole('menuitem'))

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Post pinned to community.'))
    expect(mockSetCommunityPinnedPosts).not.toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows error toast when API call fails', async () => {
    mockFetchCommunityPinnedPosts.mockRejectedValue(new Error('network error'))

    render(<PinCommunityPostMenuItem {...defaultProps} />)
    fireEvent.click(screen.getByRole('menuitem'))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to update pinned posts.'),
    )
  })
})
