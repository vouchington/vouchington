import { afterEach, describe, expect, it, vi } from 'vitest'
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
} from '@voucha/test-helpers'
import { insertTestUserReferralProgramLink } from '@voucha/test-helpers/entities/referral-links'
import { claimEngagementEmailSend, hasEngagementEmailSent } from '@services/users/engagement-emails'
import {
  buildFollowNewsSourceItems,
  buildFollowTopicsItems,
  buildReferralProgramItems,
  dispatchEngagementEmails,
} from './dispatch-engagement-emails.mts'

describe('dispatchEngagementEmails', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('dispatches follow-topic recommendations based on missing topic follows, not signup age', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(12 * 60 * 60 * 1000)
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

    await expect(dispatchEngagementEmails()).resolves.toBeUndefined()

    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(false)
  })

  it('dispatches follow-news-sources recommendations to eligible users', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(3.5 * 24 * 60 * 60 * 1000)
    const topicId = await insertTestTopic({
      name: `Email Source Topic ${random}`,
      slug: `email-source-topic-${random}`,
      createdById: admin.id,
    })
    await insertEntityRelation('relation__user__follow__topic', user.id, topicId)
    await insertTestRssFeed({
      topicId,
      title: `Email Source Feed ${random}`,
    })
    const referralProgramId = await insertTestReferralProgram({ createdById: admin.id })
    const url = await insertTestUrlDirect(user.id, `https://ref-${random}.example.com/offer`)
    await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId,
      urlId: url!.id,
    })

    await dispatchEngagementEmails()

    await expect(claimEngagementEmailSend(user.id, 'follow_news_sources')).resolves.toBe(false)
  })

  it('dispatches follow-topic recommendations to eligible users', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(1.5 * 24 * 60 * 60 * 1000)
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

    await dispatchEngagementEmails()

    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(false)
  })

  it('dispatches referral-link recommendations to eligible users', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUserWithAge(2.5 * 24 * 60 * 60 * 1000)
    const existingLinkUser = await createTestUser()
    const followedTopicId = await insertTestTopic({
      name: `Referral Existing Follow ${random}`,
      slug: `referral-existing-follow-${random}`,
      createdById: admin.id,
    })
    await insertEntityRelation('relation__user__follow__topic', user.id, followedTopicId)
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

    await dispatchEngagementEmails()

    await expect(claimEngagementEmailSend(user.id, 'post_referral_link')).resolves.toBe(false)
  })

  it('claims follow-topic recipients with no recommendations so later users can be considered', async () => {
    const user = await createTestUserWithAge(1.5 * 24 * 60 * 60 * 1000)

    await dispatchEngagementEmails()

    await expect(hasEngagementEmailSent(user.id, 'follow_topics')).resolves.toBe(false)
    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(false)
  })

  it('claims follow-news-source recipients with no recommendations so later users can be considered', async () => {
    const user = await createTestUserWithAge(3.5 * 24 * 60 * 60 * 1000)
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 10)
    const topicId = await insertTestTopic({
      name: `No Source Existing Follow ${random}`,
      slug: `no-source-existing-follow-${random}`,
      createdById: admin.id,
    })
    await insertEntityRelation('relation__user__follow__topic', user.id, topicId)
    const referralProgramId = await insertTestReferralProgram({ createdById: admin.id })
    const url = await insertTestUrlDirect(user.id, `https://existing-source-${random}.example.com`)
    await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId,
      urlId: url!.id,
    })

    await dispatchEngagementEmails()

    await expect(hasEngagementEmailSent(user.id, 'follow_news_sources')).resolves.toBe(false)
    await expect(claimEngagementEmailSend(user.id, 'follow_news_sources')).resolves.toBe(false)
  })

  it('builds follow-topic items from recommendation order', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(
      buildFollowTopicsItems(
        [
          { id: 'topic-1', reason: 'Popular in your network' },
          { id: 'topic-2', reason: null },
        ],
        [{ name: 'Travel', slug: 'travel' }, undefined],
      ),
    ).toEqual([
      {
        name: 'Travel',
        url: 'https://app.example.test/topic/travel',
        reason: 'Popular in your network',
      },
    ])
  })

  it('builds referral program items from trending program order', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(
      buildReferralProgramItems(
        [
          { id: 'program-1', link_count: 7 },
          { id: 'program-2', link_count: 3 },
        ],
        [{ name: 'Travel Card', slug: 'travel-card' }, undefined],
      ),
    ).toEqual([
      {
        name: 'Travel Card',
        url: 'https://app.example.test/referral-program/travel-card',
        linkCount: 7,
      },
    ])
  })

  it('builds news source items with home-page and rss fallbacks', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(
      buildFollowNewsSourceItems([
        {
          id: 'feed-1',
          title: 'Travel Daily',
          home_page_url: { url: 'https://news.example.test' },
          rss_feed_url: { url: 'https://news.example.test/rss.xml' },
          topic: { slug: 'travel-daily', markdown: 'Travel deals and loyalty news.' },
        },
        {
          id: 'feed-2',
          title: 'Points Wire',
          home_page_url: null,
          rss_feed_url: { url: 'https://points.example.test/rss.xml' },
          topic: { markdown: '' },
        },
        undefined,
      ]),
    ).toEqual([
      {
        name: 'Travel Daily',
        url: 'https://app.example.test/source/travel-daily',
        description: 'Travel deals and loyalty news.',
      },
      {
        name: 'Points Wire',
        url: 'https://app.example.test/source/feed-2',
        description: undefined,
      },
    ])
  })
})
