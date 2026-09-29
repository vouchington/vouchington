import { describe, expect, it } from 'vitest'
import { communityCountKeys } from './job-payload-engagement.mts'
import { parseEmailJob } from './job-payload.mts'

const address = { emailAddress: 'owner@example.test' }
const links = {
  settingsUrl: 'https://example.test/settings',
  unsubscribeUrl: 'https://example.test/unsubscribe',
}

describe('engagement email payloads', () => {
  it('validates engagement and moderation variables', () => {
    const topic = parseEmailJob('processSendFollowTopicsEmail', {
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
      parseEmailJob('processSendPostReferralLinkEmail', {
        input: address,
        variables: {
          ...links,
          referralPrograms: [{ name: 'Program', url: 'https://example.test/r', linkCount: 2 }],
        },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailJob('processSendFollowNewsSourcesEmail', {
        input: address,
        variables: {
          ...links,
          sources: [{ name: 'Feed', url: 'https://example.test/f', description: 'daily' }],
        },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailJob('processSendCommunityModerationSummaryEmail', {
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
      parseEmailJob('processSendFollowTopicsEmail', { input: address, variables: [] }),
    ).toThrow(/variables must be an object/)
    expect(() =>
      parseEmailJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, topics: [], extra: true },
      }),
    ).toThrow(/unexpected property extra/)
    expect(() =>
      parseEmailJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, topics: 'none' },
      }),
    ).toThrow(/topics must be an array/)
    expect(() =>
      parseEmailJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, userName: 1, topics: [] },
      }),
    ).toThrow(/userName must be a string/)
    expect(() =>
      parseEmailJob('processSendFollowTopicsEmail', {
        input: address,
        variables: { ...links, uiLocale: 1, topics: [] },
      }),
    ).toThrow(/uiLocale must be a string or null/)
    expect(() =>
      parseEmailJob('processSendFollowTopicsEmail', {
        input: address,
        variables: {
          ...links,
          topics: [{ name: 'News', url: 'https://example.test/t', reason: 1 }],
        },
      }),
    ).toThrow(/reason must be a string/)
    expect(() =>
      parseEmailJob('processSendPostReferralLinkEmail', {
        input: address,
        variables: {
          ...links,
          referralPrograms: [{ name: 'Program', url: 'https://example.test/r', linkCount: '2' }],
        },
      }),
    ).toThrow(/linkCount must be a number/)
    expect(() =>
      parseEmailJob('processSendFollowNewsSourcesEmail', {
        input: address,
        variables: {
          ...links,
          sources: [{ name: 'Feed', url: 'https://example.test/f', description: 1 }],
        },
      }),
    ).toThrow(/description must be a string/)
    expect(() =>
      parseEmailJob('processSendCommunityModerationSummaryEmail', {
        input: address,
        variables: { ...links, generatedForDate: '2026-09-27', communities: 'none' },
      }),
    ).toThrow(/communities must be an array/)
    expect(() =>
      parseEmailJob('processSendCommunityModerationSummaryEmail', {
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
      parseEmailJob('processSendCommunityModerationSummaryEmail', {
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
