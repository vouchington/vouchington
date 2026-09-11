import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { CommunityProxyBookmarkButton } from '../community-proxy-bookmark-button'

const entityBookmarkButton = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(
    ({ inactiveLabel, ...props }: { inactiveLabel: string; [key: string]: unknown }) => (
      <button
        type='button'
        data-pw={props['data-pw'] as string | undefined}
      >
        {inactiveLabel}
      </button>
    ),
  ),
)

vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: (props: { inactiveLabel: string; [key: string]: unknown }) =>
        entityBookmarkButton(props),
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
)

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: { id: 'user-1' },
        isAuthenticated: true,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: { id: string } | null) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

describe('CommunityProxyBookmarkButton', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    entityBookmarkButton.mockClear()
  })

  it('configures the follow proxy bookmark kind', () => {
    render(
      <CommunityProxyBookmarkButton
        communityId='community-1'
        kind='follow'
        initialActive
        variant='default'
        data-pw='proxy-bookmark'
      />,
    )

    const inactiveLabel = t(
      'extracted.communities.communityProxyBookmarkButton.virtuallyFollow_724e5f77',
    )
    expect(screen.getByRole('button', { name: inactiveLabel })).toBeDefined()
    expect(entityBookmarkButton).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'community',
        entityId: 'community-1',
        predicate: 'proxy_follow',
        activeLabel: t(
          'extracted.communities.communityProxyBookmarkButton.virtuallyFollowing_1b649994',
        ),
        inactiveLabel,
        errorLabel: t('extracted.communities.communityProxyBookmarkButton.virtualFollow_5880822a'),
        iconKey: 'proxyFollow',
        initialActive: true,
        variant: 'default',
        'data-pw': 'proxy-bookmark',
      }),
    )
  })

  it('configures the mute proxy bookmark kind', () => {
    render(
      <CommunityProxyBookmarkButton
        communityId='community-1'
        kind='mute'
      />,
    )

    expect(entityBookmarkButton).toHaveBeenLastCalledWith(
      expect.objectContaining({
        predicate: 'proxy_mute',
        activeLabel: t(
          'extracted.communities.communityProxyBookmarkButton.virtuallyMuting_e4a9fdad',
        ),
        inactiveLabel: t(
          'extracted.communities.communityProxyBookmarkButton.virtuallyMute_430f0cea',
        ),
        errorLabel: t('extracted.communities.communityProxyBookmarkButton.virtualMute_9f690d30'),
        iconKey: 'proxyMute',
        variant: 'outline',
      }),
    )
  })
})
