import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED,
  ENTITY_RELATION_BOOKMARK_BLOOM_HANDLER_UNREGISTERED,
  ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED,
  ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED,
} from '@modules/on-error/error-codes'
import {
  createBlockedHostnameGuardRegistry,
  type BlockedHostnameGuard,
} from './blocked-hostname-guard-registry.mts'
import {
  createBookmarkBloomHandlerRegistry,
  type BookmarkBloomHandler,
} from './bookmark-bloom-handler-registry.mts'
import {
  createPostRelatedUrlsGuardRegistry,
  type PostRelatedUrlsGuard,
} from './post-related-urls-guard-registry.mts'
import {
  createReferralLinkGuardRegistry,
  type ReferralLinkGuard,
} from './referral-link-guard-registry.mts'

function expectCodedError(fn: () => unknown, code: string) {
  let caughtError: unknown
  try {
    fn()
  } catch (err) {
    caughtError = err
  }
  expect(caughtError).toBeInstanceOf(Error)
  expect(caughtError).toMatchObject({ status: 500, code })
}

describe('entity-relations guard registries', () => {
  it('blocked-hostname getter throws a coded error when unregistered', () => {
    const registry = createBlockedHostnameGuardRegistry()
    expectCodedError(
      () => registry.getRegisteredBlockedHostnameGuard(),
      ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED,
    )
  })

  it('bookmark-bloom getter throws a coded error when unregistered', () => {
    const registry = createBookmarkBloomHandlerRegistry()
    expectCodedError(
      () => registry.getRegisteredBookmarkBloomHandler(),
      ENTITY_RELATION_BOOKMARK_BLOOM_HANDLER_UNREGISTERED,
    )
  })

  it('post-related-urls getter throws a coded error when unregistered', () => {
    const registry = createPostRelatedUrlsGuardRegistry()
    expectCodedError(
      () => registry.getRegisteredPostRelatedUrlsGuard(),
      ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED,
    )
  })

  it('referral-link getter throws a coded error when unregistered', () => {
    const registry = createReferralLinkGuardRegistry()
    expectCodedError(
      () => registry.getRegisteredReferralLinkGuard(),
      ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED,
    )
  })

  it('executes and replaces an owned blocked-hostname callback without sharing registration', async () => {
    const registry = createBlockedHostnameGuardRegistry()
    const firstCalls: Parameters<BlockedHostnameGuard>[] = []
    const replacementCalls: Parameters<BlockedHostnameGuard>[] = []
    registry.registerBlockedHostnameGuard(async (...args) => {
      firstCalls.push(args)
    })
    await registry.getRegisteredBlockedHostnameGuard()(['url-1'], 'user-1')
    registry.registerBlockedHostnameGuard(async (...args) => {
      replacementCalls.push(args)
    })
    await registry.getRegisteredBlockedHostnameGuard()(['url-2'], null)
    expect(firstCalls).toEqual([[['url-1'], 'user-1']])
    expect(replacementCalls).toEqual([[['url-2'], null]])
    expectCodedError(
      () => createBlockedHostnameGuardRegistry().getRegisteredBlockedHostnameGuard(),
      ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED,
    )
  })

  it('executes and replaces an owned bookmark callback without sharing registration', async () => {
    const registry = createBookmarkBloomHandlerRegistry()
    const firstCalls: Parameters<BookmarkBloomHandler>[] = []
    const replacementCalls: Parameters<BookmarkBloomHandler>[] = []
    registry.registerBookmarkBloomHandler(async (...args) => {
      firstCalls.push(args)
    })
    await registry.getRegisteredBookmarkBloomHandler()('user-1', 'bookmarks', ['url-1'])
    registry.registerBookmarkBloomHandler(async (...args) => {
      replacementCalls.push(args)
    })
    await registry.getRegisteredBookmarkBloomHandler()('user-2', 'bookmarks', ['url-2'])
    expect(firstCalls).toEqual([['user-1', 'bookmarks', ['url-1']]])
    expect(replacementCalls).toEqual([['user-2', 'bookmarks', ['url-2']]])
    expectCodedError(
      () => createBookmarkBloomHandlerRegistry().getRegisteredBookmarkBloomHandler(),
      ENTITY_RELATION_BOOKMARK_BLOOM_HANDLER_UNREGISTERED,
    )
  })

  it('executes and replaces an owned post-related-urls callback without sharing registration', async () => {
    const registry = createPostRelatedUrlsGuardRegistry()
    const creator = await createTestUser()
    const options = {}
    const firstCalls: Parameters<PostRelatedUrlsGuard>[] = []
    const replacementCalls: Parameters<PostRelatedUrlsGuard>[] = []
    registry.registerPostRelatedUrlsGuard(async (...args) => {
      firstCalls.push(args)
    })
    await registry.getRegisteredPostRelatedUrlsGuard()(creator, 'post-1', ['url-1'], options)
    registry.registerPostRelatedUrlsGuard(async (...args) => {
      replacementCalls.push(args)
    })
    await registry.getRegisteredPostRelatedUrlsGuard()(creator, 'post-2', ['url-2'])
    expect(firstCalls).toEqual([[creator, 'post-1', ['url-1'], options]])
    expect(firstCalls[0]?.[3]).toBe(options)
    expect(replacementCalls).toEqual([[creator, 'post-2', ['url-2']]])
    expectCodedError(
      () => createPostRelatedUrlsGuardRegistry().getRegisteredPostRelatedUrlsGuard(),
      ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED,
    )
  })

  it('executes and replaces an owned referral-link callback without sharing registration', async () => {
    const registry = createReferralLinkGuardRegistry()
    const options = {}
    const firstCalls: Parameters<ReferralLinkGuard>[] = []
    const replacementCalls: Parameters<ReferralLinkGuard>[] = []
    registry.registerReferralLinkGuard(async (...args) => {
      firstCalls.push(args)
    })
    await registry.getRegisteredReferralLinkGuard()(['url-1'], 'user-1', options)
    registry.registerReferralLinkGuard(async (...args) => {
      replacementCalls.push(args)
    })
    await registry.getRegisteredReferralLinkGuard()(['url-2'], null)
    expect(firstCalls).toEqual([[['url-1'], 'user-1', options]])
    expect(firstCalls[0]?.[2]).toBe(options)
    expect(replacementCalls).toEqual([[['url-2'], null]])
    expectCodedError(
      () => createReferralLinkGuardRegistry().getRegisteredReferralLinkGuard(),
      ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED,
    )
  })
})
