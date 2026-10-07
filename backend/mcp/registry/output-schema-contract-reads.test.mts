import {
  WEB_PROVENANCE,
  createRandomString,
  createReferralProgramFixture,
  createTestTopic,
  createTestUser,
  insertTestUrlHostname,
  linkPostToTopic,
  markPostsAsViewed,
  insertTestPost,
  setTopicBestSortInputs,
  setUrlHostnameVotes,
} from '@voucha/test-helpers'
import { assignReferralProgramToCard, insertTestCard } from '@voucha/test-helpers/entities/cards'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getRssFeedById } from '@services/rss-feeds/get'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { createUserReferralLink } from '@services/user-referral-program-links'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

// Each tool returns real service output through the real call path, which checks it against the
// published output schema. The "not found" results are normal results, so they must validate too.
describe('MCP output schema contract for the other read tools — real DB', () => {
  let caller: PrivateUser & { membership_plan: null }
  const suffix = createRandomString(8)

  beforeAll(async () => {
    caller = { ...(await createTestUser()), membership_plan: null }
  })

  it('returns get_domain_ratings for a hostname', async () => {
    const hostname = `contract-trust-${suffix}.example.com`
    // The scores are weighted, so the net score is fractional while the counts stay whole numbers.
    // The fractions are exact in binary, so the net score compares equal.
    await setUrlHostnameVotes(await insertTestUrlHostname({ hostname }), 7, 2, {
      up: 6.75,
      down: 2.25,
    })

    const result = await callStructuredMcpTool(caller, 'get_domain_ratings', { hostname }, [
      'domain-ratings:read',
    ])

    expect(result).toMatchObject({
      success: true,
      hostname,
      domain_trust: { votes_score_net: 4.5, votes_count_up: 7, votes_count_down: 2 },
    })
    expect(result).not.toHaveProperty('source_topic')
  })

  it('returns get_domain_ratings with the source topic and feed of a feed URL', async () => {
    const topic = await createTestTopic({
      user: caller,
      name: `Contract Source ${suffix}`,
      slug: `contract-source-${suffix}`,
      topic_type: 'rss_feed',
      hostname: `contract-source-${suffix}.example.com`,
    })
    const feed = await createTestRssFeed({
      topicId: topic.id,
      rssFeedUrl: `https://contract-source-${suffix}.example.com/feed.xml`,
      title: `Contract Feed ${suffix}`,
    })
    const rssFeed = await getRssFeedById(feed.id)
    await setUrlHostnameVotes(rssFeed!.rss_feed_url.hostname.id, 9, 1)
    await setTopicBestSortInputs(topic.id, 3)

    const result = await callStructuredMcpTool(
      caller,
      'get_domain_ratings',
      { url: rssFeed!.rss_feed_url.url },
      ['domain-ratings:read'],
    )

    expect(result).toMatchObject({
      success: true,
      rss_feed: { rss_feed_id: feed.id, title: `Contract Feed ${suffix}` },
      source_topic: { topic_id: topic.id, ratings: { count_4: 3 } },
    })
  })

  it('returns the failure results of get_domain_ratings', async () => {
    const unknown = await callStructuredMcpTool(
      caller,
      'get_domain_ratings',
      { hostname: `contract-unknown-${suffix}.example.com` },
      ['domain-ratings:read'],
    )

    expect(unknown).toEqual({ success: false, error: 'Hostname not found.' })
  })

  it('returns non-empty get_recommended_topics', async () => {
    const user = { ...(await createTestUser()), membership_plan: null }
    const topicId = await insertTestTopic({
      name: `Contract Recommended ${suffix}`,
      slug: `contract-recommended-${suffix}`,
      createdById: user.id,
    })
    const postId = await insertTestPost({
      title: `Contract Post ${suffix}`,
      slug: `contract-post-${suffix}`,
      markdown: 'Content about the topic',
      createdById: user.id,
    })
    await linkPostToTopic(postId, topicId, user.id)
    await markPostsAsViewed(user.id, [postId])

    const result = await callStructuredMcpTool(user, 'get_recommended_topics', {}, [
      'recommendations:read',
    ])

    expect(result['results']).toContainEqual({
      id: topicId,
      score: expect.any(Number),
      reason: expect.stringContaining('from_viewed_posts'),
    })
  })

  it('returns get_recommended_topics for a user with no activity', async () => {
    const user = { ...(await createTestUser()), membership_plan: null }

    const result = await callStructuredMcpTool(user, 'get_recommended_topics', {}, [
      'recommendations:read',
    ])

    expect(result).toEqual({ success: true, results: [] })
  })

  it('returns get_referral_links with labelled and unlabelled links', async () => {
    const cardTopicId = await insertTestCard({ createdById: caller.id })
    const fixture = await createReferralProgramFixture({
      createdById: caller.id,
      randomSuffix: suffix,
      hostname: `contract-referral-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    await assignReferralProgramToCard(cardTopicId, fixture.referralProgramId)
    // A user holds one link per program, so each label needs its own owner.
    for (const label of ['My referral link', null]) {
      const linkOwner = await createTestUser()
      await createUserReferralLink(linkOwner, WEB_PROVENANCE, {
        user_id: linkOwner.id,
        referral_program_id: fixture.referralProgramId,
        url: `https://${fixture.hostname}/ref/${createRandomString(8)}`,
        label,
      })
    }

    const result = await callStructuredMcpTool(
      caller,
      'get_referral_links',
      { topic_id: cardTopicId },
      ['referral-links:read'],
    )

    expect(result).toMatchObject({ success: true, referral_program_id: fixture.referralProgramId })
    expect(result['links']).toHaveLength(2)
    expect(
      (result['links'] as { label: string | null }[]).map(link => link.label).toSorted(),
    ).toEqual(['My referral link', null])
  })

  it('returns the not-found result of get_referral_links', async () => {
    const result = await callStructuredMcpTool(
      caller,
      'get_referral_links',
      { topic_id: `missing-topic-${suffix}` },
      ['referral-links:read'],
    )

    expect(result).toEqual({ success: false, error: 'Topic not found' })
  })

  it('returns non-empty search_data_points', async () => {
    const topicId = await insertTestTopic({
      name: `Contract Data Topic ${suffix}`,
      slug: `contract-data-topic-${suffix}`,
      createdById: caller.id,
      topicType: 'card',
    })
    const id = await insertTestDataPoint({
      title: `Contract Data Point ${suffix}`,
      slug: `contract-data-point-${suffix}`,
      createdById: caller.id,
      topicId,
      result: 'approved',
      creditScoreRange: '740-799',
      creditLimit: { amount: 1_000_000, currency: 'usd' },
    })

    const result = await callStructuredMcpTool(
      caller,
      'search_data_points',
      { topic_id: topicId },
      ['data-points:read'],
    )

    expect(result['results']).toEqual([
      {
        id,
        title: `Contract Data Point ${suffix}`,
        data_point_vertical: 'credit_card',
        structured_data: expect.objectContaining({ result: 'approved' }),
      },
    ])
  })

  it('returns the not-found result of search_data_points', async () => {
    const result = await callStructuredMcpTool(
      caller,
      'search_data_points',
      { topic_id: `missing-topic-${suffix}` },
      ['data-points:read'],
    )

    expect(result).toEqual({ success: false, error: 'Topic not found' })
  })
})
