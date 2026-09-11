import { describe, expect, it, vi } from 'vitest'
import {
  ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED,
  ENTITY_RELATION_BOOKMARK_BLOOM_HANDLER_UNREGISTERED,
  ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED,
  ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED,
} from '@modules/on-error/error-codes'
import type { BlockedHostnameGuard } from './blocked-hostname-guard-registry.mts'
import type { PostRelatedUrlsGuard } from './post-related-urls-guard-registry.mts'
import type { ReferralLinkGuard } from './referral-link-guard-registry.mts'

function expectCodedError(fn: () => unknown, code: string) {
  let caughtError: unknown
  try {
    fn()
  } catch (err) {
    caughtError = err
  }
  expect(caughtError).toBeInstanceOf(Error)
  expect((caughtError as { status?: number }).status).toBe(500)
  expect((caughtError as { code?: string }).code).toBe(code)
}

describe('entity-relations guard registries', () => {
  it('blocked-hostname getter throws a coded error when unregistered', async () => {
    vi.resetModules()
    const { getRegisteredBlockedHostnameGuard } =
      await import('./blocked-hostname-guard-registry.mts')
    expectCodedError(
      () => getRegisteredBlockedHostnameGuard(),
      ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED,
    )
  })

  it('bookmark-bloom getter throws a coded error when unregistered', async () => {
    vi.resetModules()
    const { getRegisteredBookmarkBloomHandler } =
      await import('./bookmark-bloom-handler-registry.mts')
    expectCodedError(
      () => getRegisteredBookmarkBloomHandler(),
      ENTITY_RELATION_BOOKMARK_BLOOM_HANDLER_UNREGISTERED,
    )
  })

  it('post-related-urls getter throws a coded error when unregistered', async () => {
    vi.resetModules()
    const { getRegisteredPostRelatedUrlsGuard } =
      await import('./post-related-urls-guard-registry.mts')
    expectCodedError(
      () => getRegisteredPostRelatedUrlsGuard(),
      ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED,
    )
  })

  it('referral-link getter throws a coded error when unregistered', async () => {
    vi.resetModules()
    const { getRegisteredReferralLinkGuard } = await import('./referral-link-guard-registry.mts')
    expectCodedError(
      () => getRegisteredReferralLinkGuard(),
      ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED,
    )
  })

  it('test url guard stubs restore unregistered registries', async () => {
    vi.resetModules()
    const [
      { getRegisteredBlockedHostnameGuard },
      { getRegisteredPostRelatedUrlsGuard },
      { getRegisteredReferralLinkGuard },
      { stubUrlGuardsForTest },
    ] = await Promise.all([
      import('./blocked-hostname-guard-registry.mts'),
      import('./post-related-urls-guard-registry.mts'),
      import('./referral-link-guard-registry.mts'),
      import('./test-support.mts'),
    ])

    const restoreUrlGuards = stubUrlGuardsForTest()

    expect(getRegisteredBlockedHostnameGuard()).toBeTypeOf('function')
    expect(getRegisteredPostRelatedUrlsGuard()).toBeTypeOf('function')
    expect(getRegisteredReferralLinkGuard()).toBeTypeOf('function')

    restoreUrlGuards()

    expectCodedError(
      () => getRegisteredBlockedHostnameGuard(),
      ENTITY_RELATION_BLOCKED_HOSTNAME_GUARD_UNREGISTERED,
    )
    expectCodedError(
      () => getRegisteredPostRelatedUrlsGuard(),
      ENTITY_RELATION_POST_RELATED_URLS_GUARD_UNREGISTERED,
    )
    expectCodedError(
      () => getRegisteredReferralLinkGuard(),
      ENTITY_RELATION_REFERRAL_LINK_GUARD_UNREGISTERED,
    )
  })

  it('test url guard stubs restore previously registered guards', async () => {
    vi.resetModules()
    const [
      blockedHostnameRegistry,
      postRelatedUrlsRegistry,
      referralLinkRegistry,
      { stubUrlGuardsForTest },
    ] = await Promise.all([
      import('./blocked-hostname-guard-registry.mts'),
      import('./post-related-urls-guard-registry.mts'),
      import('./referral-link-guard-registry.mts'),
      import('./test-support.mts'),
    ])
    const blockedHostnameGuard = vi.fn<BlockedHostnameGuard>()
    const postRelatedUrlsGuard = vi.fn<PostRelatedUrlsGuard>()
    const referralLinkGuard = vi.fn<ReferralLinkGuard>()

    blockedHostnameRegistry.registerBlockedHostnameGuard(blockedHostnameGuard)
    postRelatedUrlsRegistry.registerPostRelatedUrlsGuard(postRelatedUrlsGuard)
    referralLinkRegistry.registerReferralLinkGuard(referralLinkGuard)

    try {
      const restoreUrlGuards = stubUrlGuardsForTest()

      expect(blockedHostnameRegistry.getRegisteredBlockedHostnameGuard()).not.toBe(
        blockedHostnameGuard,
      )
      expect(postRelatedUrlsRegistry.getRegisteredPostRelatedUrlsGuard()).not.toBe(
        postRelatedUrlsGuard,
      )
      expect(referralLinkRegistry.getRegisteredReferralLinkGuard()).not.toBe(referralLinkGuard)

      restoreUrlGuards()

      expect(blockedHostnameRegistry.getRegisteredBlockedHostnameGuard()).toBe(blockedHostnameGuard)
      expect(postRelatedUrlsRegistry.getRegisteredPostRelatedUrlsGuard()).toBe(postRelatedUrlsGuard)
      expect(referralLinkRegistry.getRegisteredReferralLinkGuard()).toBe(referralLinkGuard)
    } finally {
      blockedHostnameRegistry.unregisterBlockedHostnameGuardForTest()
      postRelatedUrlsRegistry.unregisterPostRelatedUrlsGuardForTest()
      referralLinkRegistry.unregisterReferralLinkGuardForTest()
    }
  })
})
