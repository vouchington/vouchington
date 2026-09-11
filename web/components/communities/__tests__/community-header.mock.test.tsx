import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommunityHeader } from '../community-header'
import { makeCommunity } from '@/test-helpers/api-responses/communities'
import type { Community } from '@/types/api-responses'

const communityProxyBookmarkButton = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockJoinButton = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: () => (props: Record<string, unknown>) => {
        mockJoinButton(props)
        return <button type='button'>Join</button>
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(import('../message-mods-button'), () => ({
  default: () => <div data-testid='message-mods-button' />,
}))

vi.mock(
  import('../community-proxy-bookmark-button'),
  () =>
    ({
      CommunityProxyBookmarkButton: (props: Record<string, unknown>) =>
        communityProxyBookmarkButton(props),
    }) as unknown as typeof import('../community-proxy-bookmark-button'),
)

vi.mock(
  import('../join-button'),
  () =>
    ({
      default: (props: Record<string, unknown>) => {
        mockJoinButton(props)
        return <button type='button'>Join</button>
      },
    }) as unknown as typeof import('../join-button'),
)

const community: Community = makeCommunity({
  id: 'community-1',
  slug: 'community-one',
  name: 'Community One',
  markdown: 'A community',
  list_type: 'follow',
  created_by_id: 'owner-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

describe('CommunityHeader', () => {
  beforeEach(() => {
    communityProxyBookmarkButton.mockReset()
    mockJoinButton.mockReset()
  })

  it('renders the canonical proxy bookmark control without viewer props', () => {
    communityProxyBookmarkButton.mockImplementation((props: { kind: string }) => (
      <button type='button'>{props.kind}</button>
    ))

    render(<CommunityHeader community={community} />)

    expect(screen.getByRole('button', { name: 'follow' })).toBeDefined()
    expect(communityProxyBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'follow' }),
    )
    expect(communityProxyBookmarkButton).toHaveBeenCalledOnce()
  })

  it('uses list type as the canonical proxy bookmark action', () => {
    communityProxyBookmarkButton.mockImplementation((props: { kind: string }) => (
      <button type='button'>{props.kind}</button>
    ))

    render(<CommunityHeader community={{ ...community, list_type: 'mute' }} />)

    expect(communityProxyBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'mute', variant: 'default' }),
    )
    expect(communityProxyBookmarkButton).toHaveBeenCalledOnce()
  })

  it('forwards hasPendingApplication to JoinButton', () => {
    communityProxyBookmarkButton.mockImplementation((props: { kind: string }) => (
      <button type='button'>{props.kind}</button>
    ))

    render(
      <CommunityHeader
        community={community}
        hasPendingApplication
      />,
    )

    expect(mockJoinButton).toHaveBeenCalledWith(
      expect.objectContaining({ hasPendingApplication: true }),
    )
  })
})
