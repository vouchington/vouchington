import { describe, expect, it } from 'vitest'
import { JobPayloadError } from './job-payload.mts'
import {
  createModerationSummaryJobPayload,
  moderationSummaryCollectionFixture,
  moderationSummaryCommunityFixture,
  moderationSummaryIds,
  parseModerationSummaryJob,
  roundTripModerationSummaryJob,
} from '../../../test-helpers/moderation-summary-payload.mts'

describe('moderation summary collection email payload', () => {
  it('round trips a ranked community with a resumable child-reply scan through the public job parser', () => {
    const parsed = roundTripModerationSummaryJob(createModerationSummaryJobPayload())

    expect(parsed).toMatchObject({
      kind: 'moderation-summary-stage',
      stage: 'replies',
      input: {
        userId: moderationSummaryIds.user,
        trackingKey: 'moderation-summary-test-key',
        windowStart: '2026-11-08T20:00:00.000Z',
        windowEnd: '2026-11-15T20:00:00.000Z',
      },
      variables: {
        communities: [moderationSummaryCommunityFixture],
        collection: moderationSummaryCollectionFixture,
      },
    })
  })

  it('accepts a send state with no scan and the discussion cursor at the end of the ranking', () => {
    const ready = {
      ...moderationSummaryCollectionFixture,
      discussionCommunityIndex: 1,
      scan: null,
    }

    expect(
      roundTripModerationSummaryJob(
        createModerationSummaryJobPayload({ collection: ready }),
        'processSendCommunityModerationSummaryEmail',
      ),
    ).toMatchObject({ kind: 'template', variables: { collection: ready } })
  })

  it('takes a memberships state with no scan and every stage job name', () => {
    const memberships = { ...moderationSummaryCollectionFixture, scan: null }
    expect(
      parseModerationSummaryJob(
        createModerationSummaryJobPayload({ collection: memberships }),
        'collectModerationSummaryMemberships',
      ),
    ).toMatchObject({ kind: 'moderation-summary-stage', stage: 'memberships' })
    for (const name of [
      'Reviews',
      'Applications',
      'ReportPosts',
      'Reports',
      'Evaders',
      'Members',
      'ActivityPosts',
      'Replies',
      'Card',
    ])
      expect(
        parseModerationSummaryJob(
          createModerationSummaryJobPayload(),
          `collectModerationSummary${name}`,
        ),
      ).toMatchObject({ kind: 'moderation-summary-stage' })
  })

  it('accepts nullable card metrics, an empty card list, and the maximum remaining count', () => {
    const nullableCommunity = {
      ...moderationSummaryCommunityFixture,
      netMemberChange: null,
      activeMemberRate: null,
      topDiscussionTitle: null,
    }

    expect(
      parseModerationSummaryJob(
        createModerationSummaryJobPayload({
          communities: [nullableCommunity],
          remainingCommunityCount: 100,
        }),
      ),
    ).toMatchObject({
      kind: 'moderation-summary-stage',
      variables: { communities: [nullableCommunity], remainingCommunityCount: 100 },
    })
    expect(
      parseModerationSummaryJob(createModerationSummaryJobPayload({ communities: [] })),
    ).toMatchObject({ kind: 'moderation-summary-stage', variables: { communities: [] } })
  })

  it.each([
    [
      'a child stage without its parent',
      { scan: { ...moderationSummaryCollectionFixture.scan, parentId: null } },
    ],
    ['a scan stage without its active scan', { scan: null }],
    ['a stage that has no activity window end', { activityWindowEnd: null }],
    ['a discussion stage past its last selected community', { discussionCommunityIndex: 1 }],
    ['a discussion cursor beyond the selected communities', { discussionCommunityIndex: 2 }],
    ['an eligibility count smaller than the selected ranking', { eligibleCount: 0 }],
    [
      'a duplicate selected community',
      {
        top: [
          moderationSummaryCollectionFixture.top[0],
          { ...moderationSummaryCollectionFixture.top[0] },
        ],
      },
    ],
    [
      'a child upper bound that is not a UUID',
      { scan: { ...moderationSummaryCollectionFixture.scan, childUpperId: 'after-child' } },
    ],
    [
      'a best discussion reply count above its bound',
      {
        scan: {
          ...moderationSummaryCollectionFixture.scan,
          bestDiscussion: { id: moderationSummaryIds.parent, replies: 101 },
        },
      },
    ],
    ['a malformed event identifier', { eventId: 'event-id' }],
    ['an invalid activity window end', { activityWindowEnd: 'yesterday' }],
    ['a retired collection phase', { phase: 'ready' }],
    [
      'a retired scan stage',
      { scan: { ...moderationSummaryCollectionFixture.scan, stage: 'replies' } },
    ],
    [
      'more than 20 selected communities',
      {
        eligibleCount: 21,
        top: Array.from({ length: 21 }, (_, index) => ({
          ...moderationSummaryCollectionFixture.top[0],
          communityId: `01900000-0000-7000-8000-${String(index + 100).padStart(12, '0')}`,
        })),
      },
    ],
  ])('rejects %s', (_description, collectionChanges) => {
    expect(() =>
      parseModerationSummaryJob(
        createModerationSummaryJobPayload({
          collection: { ...moderationSummaryCollectionFixture, ...collectionChanges },
        }),
      ),
    ).toThrow(JobPayloadError)
  })

  it.each(['processSendCommunityModerationSummaryEmail', 'collectModerationSummaryMemberships'])(
    'rejects a %s payload that still carries a community scan',
    jobName => {
      expect(() => parseModerationSummaryJob(createModerationSummaryJobPayload(), jobName)).toThrow(
        JobPayloadError,
      )
    },
  )

  it('rejects a stage job without a user, tracking key or window', () => {
    const payload = createModerationSummaryJobPayload()
    expect(() =>
      parseModerationSummaryJob({ ...payload, input: { userId: moderationSummaryIds.user } }),
    ).toThrow(JobPayloadError)
  })

  it.each([
    ['remaining community count above its bound', { remainingCommunityCount: 101 }],
    [
      'a non-finite optional card metric',
      { communities: [{ ...moderationSummaryCommunityFixture, activeMemberRate: Number.NaN }] },
    ],
    [
      'a card count above its bound',
      { communities: [{ ...moderationSummaryCommunityFixture, pendingReports: 101 }] },
    ],
  ])('rejects %s', (_description, changes) => {
    expect(() => parseModerationSummaryJob(createModerationSummaryJobPayload(changes))).toThrow(
      JobPayloadError,
    )
  })
})
