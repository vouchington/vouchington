import { describe, expect, it, vi } from 'vitest'

describe('service registrations', () => {
  it('registers a handler with every dependency-inversion registry it wires', async () => {
    vi.resetModules()
    await import('./index.mts')
    const [
      { getRegisteredBlockedHostnameGuard },
      { getRegisteredBookmarkBloomHandler },
      { getRegisteredElectionVoteHandler },
      { getRegisteredPostRelatedUrlsGuard },
      { getRegisteredReferralLinkGuard },
      { getRegisteredImageExistsGuard },
      { getRegisteredRecommendationApprovedHandler },
    ] = await Promise.all([
      import('@services/entity-relations/blocked-hostname-guard-registry'),
      import('@services/entity-relations/bookmark-bloom-handler-registry'),
      import('@services/entity-relations/election-vote-handler-registry'),
      import('@services/entity-relations/post-related-urls-guard-registry'),
      import('@services/entity-relations/referral-link-guard-registry'),
      import('@services/topics/image-exists-guard-registry'),
      import('@services/topic-recommendations/recommendation-approved-handler-registry'),
    ])

    expect(getRegisteredBlockedHostnameGuard()).toBeTypeOf('function')
    expect(getRegisteredBookmarkBloomHandler()).toBeTypeOf('function')
    expect(getRegisteredElectionVoteHandler()).toBeTypeOf('function')
    expect(getRegisteredPostRelatedUrlsGuard()).toBeTypeOf('function')
    expect(getRegisteredReferralLinkGuard()).toBeTypeOf('function')
    expect(getRegisteredImageExistsGuard()).toBeTypeOf('function')
    expect(getRegisteredRecommendationApprovedHandler()).toBeTypeOf('function')
  })
})
