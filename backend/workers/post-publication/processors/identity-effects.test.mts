import { describe, expect, it, vi } from 'vitest'
import {
  applyPostPublicationIdentityEffects,
  type PublicationIdentityEffectDependencies,
} from './identity-effects.mts'

const MAX_PAGE_IDENTITIES_PER_SURFACE = 25_000

function makeDependencies() {
  return {
    invalidatePost: vi.fn<(...keys: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    invalidateUser: vi.fn<(...keys: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    invalidateCommunity: vi
      .fn<(...keys: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    invalidateRssFeed: vi.fn<(...keys: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    invalidateTopic: vi.fn<(...keys: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
  } satisfies PublicationIdentityEffectDependencies
}

describe('post publication identity effects', () => {
  it('batches a maximum reconciliation page into one strict invalidation per identity surface', async () => {
    const dependencies = makeDependencies()
    const keys = [
      ...Array.from({ length: MAX_PAGE_IDENTITIES_PER_SURFACE }, (_, index) => ({
        kind: 'author',
        value: `author-${index}`,
      })),
      ...Array.from({ length: MAX_PAGE_IDENTITIES_PER_SURFACE }, (_, index) => ({
        kind: 'post_slug',
        value: `post-${index}`,
      })),
      ...Array.from({ length: MAX_PAGE_IDENTITIES_PER_SURFACE }, (_, index) => ({
        kind: 'rss_feed',
        value: `rss-${index}`,
      })),
      ...Array.from({ length: MAX_PAGE_IDENTITIES_PER_SURFACE / 2 }, (_, index) => ({
        kind: 'community',
        value: `community-${index}`,
      })),
      ...Array.from({ length: MAX_PAGE_IDENTITIES_PER_SURFACE / 2 }, (_, index) => ({
        kind: 'community_slug',
        value: `community-slug-${index}`,
      })),
      { kind: 'author', value: 'author-0' },
      { kind: 'community_slug', value: 'community-slug-0' },
      { kind: 'post_slug', value: 'post-0' },
      { kind: 'rss_feed', value: 'rss-0' },
      { kind: 'topic_alias', value: 'former-alias' },
    ]

    await applyPostPublicationIdentityEffects(keys, dependencies)

    expect(dependencies.invalidateUser).toHaveBeenCalledOnce()
    expect(dependencies.invalidateCommunity).toHaveBeenCalledOnce()
    expect(dependencies.invalidatePost).toHaveBeenCalledOnce()
    expect(dependencies.invalidateRssFeed).toHaveBeenCalledOnce()
    expect(dependencies.invalidateTopic).toHaveBeenCalledWith('former-alias')
    expect(dependencies.invalidateUser.mock.calls[0]).toHaveLength(MAX_PAGE_IDENTITIES_PER_SURFACE)
    expect(dependencies.invalidateCommunity.mock.calls[0]).toHaveLength(
      MAX_PAGE_IDENTITIES_PER_SURFACE,
    )
    expect(dependencies.invalidatePost.mock.calls[0]).toHaveLength(MAX_PAGE_IDENTITIES_PER_SURFACE)
    expect(dependencies.invalidateRssFeed.mock.calls[0]).toHaveLength(
      MAX_PAGE_IDENTITIES_PER_SURFACE,
    )
  })

  it('rejects unsupported identities before applying any strict invalidation', async () => {
    const dependencies = makeDependencies()

    await expect(
      applyPostPublicationIdentityEffects(
        [
          { kind: 'author', value: 'author' },
          { kind: 'unsupported', value: 'unsupported' },
        ],
        dependencies,
      ),
    ).rejects.toThrow('Unsupported publication identity kind: unsupported')

    expect(dependencies.invalidateUser).not.toHaveBeenCalled()
    expect(dependencies.invalidateCommunity).not.toHaveBeenCalled()
    expect(dependencies.invalidatePost).not.toHaveBeenCalled()
    expect(dependencies.invalidateRssFeed).not.toHaveBeenCalled()
    expect(dependencies.invalidateTopic).not.toHaveBeenCalled()
  })
})
