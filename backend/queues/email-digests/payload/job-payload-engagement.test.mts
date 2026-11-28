import { describe, expect, it } from 'vitest'
import { parseEmailDigestJob } from './job-payload.mts'
import { moderationSummaryVariableDefaults } from '@voucha/test-helpers/moderation-summary-collection'

const communityCountKeys = [
  'pendingPostReviews',
  'pendingApplications',
  'pendingReports',
  'escalatedItems',
  'suspectedBanEvaders',
  'newMembers',
  'departedMembers',
  'totalActiveMembers',
  'newDiscussionPosts',
  'newReviewPosts',
  'newDataPointPosts',
  'topDiscussionReplyCount',
  'activeMemberCount',
] as const

const address = { emailAddress: 'owner@example.test' }
const moderationInput = {
  userId: '00000000-0000-7000-8000-000000000001',
  trackingKey: 'daily:2026-09-27',
  windowStart: '2026-09-26T00:00:00.000Z',
  windowEnd: '2026-09-27T00:00:00.000Z',
}
const links = {
  settingsUrl: 'https://example.test/settings',
  unsubscribeUrl: 'https://example.test/unsubscribe',
  physicalAddress: '1 Main',
}

describe('engagement email payloads', () => {
  it('validates engagement and moderation variables', () => {
    const topic = parseEmailDigestJob('processSendFollowTopicsEmail', {
      input: address,
      variables: {
        ...links,
        userName: 'Ada',
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
        input: moderationInput,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          dispatchTimeZone: 'UTC',
          uiLocale: null,
          ...moderationSummaryVariableDefaults(),
          communities: [
            {
              communityId: '01900000-0000-7000-8000-000000000001',
              name: 'Voucha',
              url: 'https://example.test/c',
              topDiscussionTitle: null,
              netMemberChange: null,
              activeMemberRate: null,
              ...Object.fromEntries(communityCountKeys.map(key => [key, 0])),
            },
          ],
        },
      }).kind,
    ).toBe('template')
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: moderationInput,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          ...moderationSummaryVariableDefaults(),
          communities: [],
        },
      }),
    ).toThrow(/dispatchTimeZone/)
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: { ...moderationInput, windowEnd: undefined },
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          dispatchTimeZone: 'UTC',
          ...moderationSummaryVariableDefaults(),
          communities: [],
        },
      }),
    ).toThrow(/windowEnd/)
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
        variables: {
          settingsUrl: links.settingsUrl,
          unsubscribeUrl: links.unsubscribeUrl,
          topics: [],
        },
      }),
    ).toThrow(/physicalAddress must be a string/)
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
        input: moderationInput,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          dispatchTimeZone: 'UTC',
          ...moderationSummaryVariableDefaults(),
          communities: 'none',
        },
      }),
    ).toThrow(/communities must be an array/)
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: moderationInput,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          dispatchTimeZone: 'UTC',
          ...moderationSummaryVariableDefaults(),
          communities: [
            {
              communityId: '01900000-0000-7000-8000-000000000001',
              name: 'Voucha',
              url: 'https://example.test/c',
              topDiscussionTitle: 1,
              netMemberChange: null,
              activeMemberRate: null,
              ...Object.fromEntries(communityCountKeys.map(key => [key, 0])),
            },
          ],
        },
      }),
    ).toThrow(/topDiscussionTitle must be a string or null/)
    expect(() =>
      parseEmailDigestJob('processSendCommunityModerationSummaryEmail', {
        input: moderationInput,
        variables: {
          ...links,
          generatedForDate: '2026-09-27',
          dispatchTimeZone: 'UTC',
          ...moderationSummaryVariableDefaults(),
          communities: [
            {
              communityId: '01900000-0000-7000-8000-000000000001',
              name: 'Voucha',
              url: 'https://example.test/c',
              topDiscussionTitle: 'Hello',
              netMemberChange: null,
              activeMemberRate: null,
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
