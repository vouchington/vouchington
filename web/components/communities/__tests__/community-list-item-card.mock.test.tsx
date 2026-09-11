import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CommunityListItemCard } from '../community-list-item-card'
import { removeCommunityListItem } from '@/lib/api/client'
import onError, { onSuccess } from '@/lib/on-error'
import type { CommunityListItem, CommunityListPageData } from '@/types/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client'), () => ({
  removeCommunityListItem: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

const item = {
  id: 'item-1',
  community_id: 'community-1',
  entity_type: 'topic',
  entity_id: 'topic-1',
  created_at: '2026-01-01T00:00:00Z',
  created_by_id: 'user-1',
} as unknown as CommunityListItem

const data = {
  topics: {
    'topic-1': { id: 'topic-1', name: 'Travel', slug: 'travel', topic_type: 'topic' },
  },
  rss_feeds: {
    'feed-1': { id: 'feed-1', title: 'Rewards News' },
  },
  posts: {
    'post-1': {
      id: 'post-1',
      title: 'Best rewards card',
      post_type: 'discussion',
      created_at: '2026-01-01T00:00:00Z',
      declared_language: 'ar',
      lingua_rs_detected_language: 'en',
    },
    'comment-1': {
      id: 'comment-1',
      title: 'Comment item',
      post_type: 'comment',
      created_at: '2026-01-01T00:00:00Z',
      declared_language: null,
      lingua_rs_detected_language: 'fr',
    },
    'story-1': {
      id: 'story-1',
      title: 'Story item',
      post_type: 'story',
      created_at: '2026-01-01T00:00:00Z',
    },
  },
  url_hostnames: {
    'hostname-1': { id: 'hostname-1', hostname: 'example.com' },
  },
  urls: {
    'url-1': { id: 'url-1', url: 'https://example.com/deals' },
  },
} as unknown as CommunityListPageData

const mockRemoveCommunityListItem = vi.mocked(removeCommunityListItem)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

describe('CommunityListItemCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRemoveCommunityListItem.mockResolvedValue(undefined)
  })

  it('renders list item card with data-pw', () => {
    const { container } = render(
      <CommunityListItemCard
        item={item}
        itemType='topic'
        data={data}
        communitySlug='test-community'
      />,
    )

    expect(container.querySelector('[data-pw="community-list-item-card"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Travel' })).toHaveAttribute('href', '/topic/travel')
  })

  it('shows remove button for managers', () => {
    render(
      <CommunityListItemCard
        item={item}
        itemType='topic'
        data={data}
        communitySlug='test-community'
        canManage
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove Travel from list' })).toBeInTheDocument()
  })

  it('renders comment post items without a canonical post link', () => {
    render(
      <CommunityListItemCard
        item={{ ...item, entity_type: 'post', entity_id: 'comment-1' } as CommunityListItem}
        itemType='post'
        data={data}
        communitySlug='test-community'
      />,
    )

    expect(screen.getByText('Comment item')).toBeInTheDocument()
    expect(screen.getByText('Comment item')).toHaveAttribute('lang', 'fr')
    expect(screen.getByText('Comment item')).toHaveAttribute('dir', 'ltr')
    expect(screen.queryByRole('link', { name: 'Comment item' })).not.toBeInTheDocument()
  })

  it('sets content lang and direction on linked post item titles using declared language before detected language', () => {
    render(
      <CommunityListItemCard
        item={{ ...item, entity_type: 'post', entity_id: 'post-1' } as CommunityListItem}
        itemType='post'
        data={data}
        communitySlug='test-community'
      />,
    )

    const title = screen.getByRole('link', { name: 'Best rewards card' })
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
  })

  it('links story post items to the story route', () => {
    render(
      <CommunityListItemCard
        item={{ ...item, entity_type: 'post', entity_id: 'story-1' } as CommunityListItem}
        itemType='post'
        data={data}
        communitySlug='test-community'
      />,
    )

    expect(screen.getByRole('link', { name: 'Story item' })).toHaveAttribute(
      'href',
      '/story/story-1',
    )
  })

  it('removes an item and shows the resolved label', async () => {
    render(
      <CommunityListItemCard
        item={item}
        itemType='topic'
        data={data}
        communitySlug='test-community'
        canManage
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Travel from list' }))

    await waitFor(() => {
      expect(mockRemoveCommunityListItem).toHaveBeenCalledWith('test-community', 'topic', 'item-1')
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Travel removed from list')
  })

  it('does not submit another removal while the current request is pending', async () => {
    let resolveRemove!: () => void
    mockRemoveCommunityListItem.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveRemove = resolve
        }),
    )

    render(
      <CommunityListItemCard
        item={item}
        itemType='topic'
        data={data}
        communitySlug='test-community'
        canManage
      />,
    )

    const button = screen.getByRole('button', { name: 'Remove Travel from list' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockRemoveCommunityListItem).toHaveBeenCalledOnce()
    })
    resolveRemove()
  })

  it('shows a fallback error when removal fails', async () => {
    const error = new Error('failed')
    mockRemoveCommunityListItem.mockRejectedValueOnce(error)

    render(
      <CommunityListItemCard
        item={item}
        itemType='topic'
        data={data}
        communitySlug='test-community'
        canManage
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Travel from list' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(error, {
        fallback: 'Failed to remove Travel from list',
      })
    })
  })

  it.each([
    ['rss_feed' as const, 'feed-1', 'Rewards News'],
    ['post' as const, 'post-1', 'Best rewards card'],
    ['url_hostname' as const, 'hostname-1', 'example.com'],
    ['url' as const, 'url-1', 'https://example.com/deals'],
  ])('uses the %s label in remove controls', (itemType, entityId, label) => {
    render(
      <CommunityListItemCard
        item={{ ...item, entity_id: entityId }}
        itemType={itemType}
        data={data}
        communitySlug='test-community'
        canManage
      />,
    )

    expect(screen.getByRole('button', { name: `Remove ${label} from list` })).toBeInTheDocument()
  })
})
