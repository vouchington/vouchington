import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  createTestUserWithAge,
  insertEntityRelation,
  insertTestPost,
  insertTestReferralProgram,
  insertTestRssFeed,
  insertTestTopic,
  insertTestUrlDirect,
  linkPostToTopic,
  markPostsAsViewed,
  updateTopicMarkdown,
} from '@voucha/test-helpers'
import { insertTestUserReferralProgramLink } from '@voucha/test-helpers/entities/referral-links'
import {
  ownedEngagementDispatch,
  scopedEngagementClaimResult,
} from '@voucha/test-helpers/engagement-dispatch-jobs'

describe('dispatchEngagementEmails', () => {
  beforeEach(() => vi.stubEnv('SITE_ORIGIN', 'https://app.example.test'))
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('dispatches follow-topic recommendations based on missing topic follows, not signup age', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(12 * 60 * 60 * 1000)
    const foreign = await createTestUserWithAge(12 * 60 * 60 * 1000)
    const topicId = await insertTestTopic({
      name: `Email Young Topic ${random}`,
      slug: `email-young-topic-${random}`,
      createdById: admin.id,
    })
    const postId = await insertTestPost({
      title: `Email Young Topic Post ${random}`,
      slug: `email-young-topic-post-${random}`,
      markdown: 'A post that would recommend a topic if the user were old enough.',
      createdById: admin.id,
    })
    await linkPostToTopic(postId, topicId, admin.id)
    await markPostsAsViewed(user.id, [postId])
    await markPostsAsViewed(foreign.id, [postId])
    const observed = await ownedEngagementDispatch(user.id, foreign.id, 'follow_topics')
    expect(observed.claims).toEqual(scopedEngagementClaimResult)
    expect(observed.targetJobs).toMatchObject([
      {
        name: 'email-digests.processSendFollowTopicsEmail',
        data: {
          input: { userId: user.id },
          variables: {
            topics: expect.arrayContaining([
              expect.objectContaining({
                name: `Email Young Topic ${random}`,
                url: `https://app.example.test/topic/email-young-topic-${random}`,
                reason: 'from_viewed_posts',
              }),
            ]),
          },
        },
      },
    ])
  })

  it('dispatches follow-news-sources recommendations to eligible users', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(3.5 * 24 * 60 * 60 * 1000)
    const foreign = await createTestUserWithAge(3.5 * 24 * 60 * 60 * 1000)
    const topicId = await insertTestTopic({
      name: `Email Source Topic ${random}`,
      slug: `email-source-topic-${random}`,
      createdById: admin.id,
    })
    await insertTestRssFeed({
      topicId,
      title: `Email Source Feed ${random}`,
    })
    const describedTopicId = await insertTestTopic({
      name: `Email Described Source ${random}`,
      slug: `email-described-source-${random}`,
      createdById: admin.id,
    })
    await updateTopicMarkdown(describedTopicId, 'Owned source description.')
    await insertTestRssFeed({
      topicId: describedTopicId,
      title: `Email Described Feed ${random}`,
    })
    const referralProgramId = await insertTestReferralProgram({ createdById: admin.id })
    for (const recipient of [user, foreign]) {
      await insertEntityRelation('relation__user__follow__topic', recipient.id, topicId)
      await insertEntityRelation('relation__user__follow__topic', recipient.id, describedTopicId)
      const url = await insertTestUrlDirect(
        recipient.id,
        `https://ref-${recipient.id}.example.com/offer`,
      )
      await insertTestUserReferralProgramLink({
        userId: recipient.id,
        referralProgramId,
        urlId: url!.id,
      })
    }
    const observed = await ownedEngagementDispatch(user.id, foreign.id, 'follow_news_sources')
    expect(observed.claims).toEqual(scopedEngagementClaimResult)
    expect(observed.targetJobs).toMatchObject([
      {
        name: 'email-digests.processSendFollowNewsSourcesEmail',
        data: {
          input: { userId: user.id },
          variables: {
            sources: expect.arrayContaining([
              expect.objectContaining({
                name: `Email Source Feed ${random}`,
                url: `https://app.example.test/source/email-source-topic-${random}`,
              }),
              expect.objectContaining({
                name: `Email Described Feed ${random}`,
                url: `https://app.example.test/source/email-described-source-${random}`,
                description: 'Owned source description.',
              }),
            ]),
          },
        },
      },
    ])
    const variables = observed.targetJobs[0]!.data as {
      variables: { sources: Array<{ name: string; description?: string }> }
    }
    const emptyDescriptionSource = variables.variables.sources.find(
      source => source.name === `Email Source Feed ${random}`,
    )
    expect(emptyDescriptionSource).not.toHaveProperty('description')
  })

  it('dispatches follow-topic recommendations to eligible users', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(1.5 * 24 * 60 * 60 * 1000)
    const foreign = await createTestUserWithAge(1.5 * 24 * 60 * 60 * 1000)
    const topicId = await insertTestTopic({
      name: `Email Topic ${random}`,
      slug: `email-topic-${random}`,
      createdById: admin.id,
    })
    const postId = await insertTestPost({
      title: `Email Topic Post ${random}`,
      slug: `email-topic-post-${random}`,
      markdown: 'A post that gives the new user a topic recommendation.',
      createdById: admin.id,
    })
    await linkPostToTopic(postId, topicId, admin.id)
    await markPostsAsViewed(user.id, [postId])
    await markPostsAsViewed(foreign.id, [postId])
    const observed = await ownedEngagementDispatch(user.id, foreign.id, 'follow_topics')
    expect(observed.claims).toEqual(scopedEngagementClaimResult)
    expect(observed.targetJobs).toMatchObject([
      {
        name: 'email-digests.processSendFollowTopicsEmail',
        data: {
          input: { userId: user.id },
          variables: {
            topics: expect.arrayContaining([
              expect.objectContaining({
                name: `Email Topic ${random}`,
                url: `https://app.example.test/topic/email-topic-${random}`,
                reason: 'from_viewed_posts',
              }),
            ]),
          },
        },
      },
    ])
  })

  it('dispatches referral-link recommendations to eligible users', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(2.5 * 24 * 60 * 60 * 1000)
    const foreign = await createTestUserWithAge(2.5 * 24 * 60 * 60 * 1000)
    const existingLinkUser = await createTestUser()
    const followedTopicId = await insertTestTopic({
      name: `Referral Existing Follow ${random}`,
      slug: `referral-existing-follow-${random}`,
      createdById: admin.id,
    })
    await insertEntityRelation('relation__user__follow__topic', user.id, followedTopicId)
    await insertEntityRelation('relation__user__follow__topic', foreign.id, followedTopicId)
    const referralProgramId = await insertTestReferralProgram({
      createdById: admin.id,
      name: `Email Referral Program ${random}`,
    })
    const url = await insertTestUrlDirect(
      existingLinkUser.id,
      `https://existing-ref-${random}.example.com/offer`,
    )
    await insertTestUserReferralProgramLink({
      userId: existingLinkUser.id,
      referralProgramId,
      urlId: url!.id,
    })
    const observed = await ownedEngagementDispatch(user.id, foreign.id, 'post_referral_link')
    expect(observed.claims).toEqual(scopedEngagementClaimResult)
    expect(observed.targetJobs).toMatchObject([
      {
        name: 'email-digests.processSendPostReferralLinkEmail',
        data: {
          input: { userId: user.id },
          variables: {
            referralPrograms: expect.arrayContaining([
              expect.objectContaining({
                name: expect.any(String),
                url: expect.stringMatching(/^https:\/\/app\.example\.test\/referral-program\//),
                linkCount: expect.any(Number),
              }),
            ]),
          },
        },
      },
    ])
    const payload = observed.targetJobs[0]!.data as {
      variables: { referralPrograms: Array<{ linkCount: number }> }
    }
    for (const program of payload.variables.referralPrograms) {
      expect(program.linkCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('claims follow-topic recipients with no recommendations so later users can be considered', async () => {
    const user = await createTestUserWithAge(1.5 * 24 * 60 * 60 * 1000)
    const foreign = await createTestUserWithAge(1.5 * 24 * 60 * 60 * 1000)
    const observed = await ownedEngagementDispatch(user.id, foreign.id, 'follow_topics')
    expect(observed.claims).toEqual(scopedEngagementClaimResult)
  })

  it('claims follow-news-source recipients with no recommendations so later users can be considered', async () => {
    const user = await createTestUserWithAge(3.5 * 24 * 60 * 60 * 1000)
    const foreign = await createTestUserWithAge(3.5 * 24 * 60 * 60 * 1000)
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 10)
    const topicId = await insertTestTopic({
      name: `No Source Existing Follow ${random}`,
      slug: `no-source-existing-follow-${random}`,
      createdById: admin.id,
    })
    const referralProgramId = await insertTestReferralProgram({ createdById: admin.id })
    for (const recipient of [user, foreign]) {
      await insertEntityRelation('relation__user__follow__topic', recipient.id, topicId)
      const url = await insertTestUrlDirect(
        recipient.id,
        `https://existing-source-${recipient.id}.example.com`,
      )
      await insertTestUserReferralProgramLink({
        userId: recipient.id,
        referralProgramId,
        urlId: url!.id,
      })
    }
    const observed = await ownedEngagementDispatch(user.id, foreign.id, 'follow_news_sources')
    expect(observed.claims).toEqual(scopedEngagementClaimResult)
  })
})
