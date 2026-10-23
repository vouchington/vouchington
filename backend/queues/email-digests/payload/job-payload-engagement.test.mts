import { describe, expect, it } from 'vitest'
import { communityCountKeys } from './job-payload-engagement.mts'
import { parseEmailDigestJob } from './job-payload.mts'

const address = { emailAddress: 'owner@example.test' }
const links = {
  settingsUrl: 'https://example.test/settings',
  unsubscribeUrl: 'https://example.test/unsubscribe',
}

describe('engagement email payloads', () => {
  it('passes a dispatcher claim fence only to engagement send processors', () => {
    const owner = 'email-digests:page:owned'
    const parsed = parseEmailDigestJob('processSendFollowTopicsEmail', {
      input: { userId: '00000000-0000-7000-8000-000000000042', claimOwnerJobId: owner },
      variables: { ...links, topics: [] },
    })
    expect(parsed).toMatchObject({ kind: 'template', input: { claimOwnerJobId: owner } })
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: { ...address, claimOwnerJobId: owner },
        variables: { ...links, generatedForDate: '2026-09-27', communities: [] },
      }),
    ).toThrow(/claimOwnerJobId is only valid/)
  })

  it('validates engagement and moderation variables', () => {
    const topic = parseEmailDigestJob('processSendFollowTopicsEmail', {
      input: address,
      variables: {
        ...links,
        userName: 'Ada',
        physicalAddress: '1 Main',
        uiLocale: 'en',
        topics: [{ name: 'News', url: 'https://example.test/t', reason: 'new' }],
      },
    })
    expect(topic.kind).toBe('template')
    expect(
      parseEmailDigestJob('processSendPostReferralLinkEmail', {
        input: address,
        variables: {
          ...links,
          referralPrograms: [{ name: 'Program', url: 'https://example.test/r', linkCount: 2 }],
        },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailDigestJob('processSendFollowNewsSourcesEmail', {
        input: address,
        variables: {
          ...links,
          sources: [{ name: 'Feed', url: 'https://example.test/f', description: 'daily' }],
        },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: address,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          uiLocale: null,
          communities: [
            {
              name: 'Voucha',
              url: 'https://example.test/c',
              topDiscussionTitle: null,
              ...Object.fromEntries(communityCountKeys.map(key => [key, 0])),
            },
          ],
        },
      }).kind,
    ).toBe('template')
    expect(() =>
      parseEmailDigestJob('processSendFollowTopicsEmail', { input: address, variables: [] }),
    ).toThrow(/variables must be an object/)
    expect(() =>
      parseEmailDigestJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, topics: [], extra: true },
      }),
    ).toThrow(/unexpected property extra/)
    expect(() =>
      parseEmailDigestJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, topics: 'none' },
      }),
    ).toThrow(/topics must be an array/)
    expect(() =>
      parseEmailDigestJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, userName: 1, topics: [] },
      }),
    ).toThrow(/userName must be a string/)
    expect(() =>
      parseEmailDigestJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, uiLocale: 1, topics: [] },
      }),
    ).toThrow(/uiLocale must be a string or null/)
    expect(() =>
      parseEmailDigestJob('processSendFollowTopicsEmail', {
        input: address,
        variables: {
          ...links,
          topics: [{ name: 'News', url: 'https://example.test/t', reason: 1 }],
        },
      }),
    ).toThrow(/reason must be a string/)
    expect(() =>
      parseEmailDigestJob('processSendPostReferralLinkEmail', {
        input: address,
        variables: {
          ...links,
          referralPrograms: [{ name: 'Program', url: 'https://example.test/r', linkCount: '2' }],
        },
      }),
    ).toThrow(/linkCount must be a number/)
    expect(() =>
      parseEmailDigestJob('processSendFollowNewsSourcesEmail', {
        input: address,
        variables: {
          ...links,
          sources: [{ name: 'Feed', url: 'https://example.test/f', description: 1 }],
        },
      }),
    ).toThrow(/description must be a string/)
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: address,
        variables: { ...links, generatedForDate: '2026-09-27', communities: 'none' },
      }),
    ).toThrow(/communities must be an array/)
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: address,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          communities: [
            {
              name: 'Voucha',
              url: 'https://example.test/c',
              topDiscussionTitle: 1,
              ...Object.fromEntries(communityCountKeys.map(key => [key, 0])),
            },
          ],
        },
      }),
    ).toThrow(/topDiscussionTitle must be a string or null/)
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: address,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          communities: [
            {
              name: 'Voucha',
              url: 'https://example.test/c',
              topDiscussionTitle: 'Hello',
              ...Object.fromEntries(
                communityCountKeys.map(key => [key, key === 'pendingPostReviews' ? Number.NaN : 0]),
              ),
            },
          ],
        },
      }),
    ).toThrow(/pendingPostReviews must be a number/)
  })
})
