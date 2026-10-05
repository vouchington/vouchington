import { createTestUser, setTopicBestSortInputs } from '@voucha/test-helpers'
import {
  insertTestCardTopicsWithDataPoints,
  type CardTopicDataPointFixture,
} from '@voucha/test-helpers/entities/card-topic-data-points'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getTopicByAny } from '@services/topics/get'
import { updateCardAttributes } from '@services/topics/cards'
import { updateRewardsProgramAttributes } from '@services/topics/rewards-programs'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

const suffix = crypto.randomUUID().slice(0, 8)
const dataPoints: readonly CardTopicDataPointFixture[] = [
  {
    title: `Contract A Approved ${suffix}`,
    slug: `contract-a-approved-${suffix}`,
    topicIndex: 0,
    result: 'approved',
    creditScoreRange: '740-799',
    creditLimit: { amount: 1_500_000, currency: 'usd' },
  },
  {
    title: `Contract A Denied ${suffix}`,
    slug: `contract-a-denied-${suffix}`,
    topicIndex: 0,
    result: 'denied',
    creditScoreRange: '580-669',
  },
  {
    title: `Contract A Pending ${suffix}`,
    slug: `contract-a-pending-${suffix}`,
    topicIndex: 0,
    result: 'pending',
  },
  {
    title: `Contract B Approved ${suffix}`,
    slug: `contract-b-approved-${suffix}`,
    topicIndex: 1,
    result: 'approved',
    creditScoreRange: '670-739',
    creditLimit: { amount: 800_000, currency: 'usd' },
  },
]

// Each tool returns real service output through the real call path, which checks it against the
// published output schema. The "not found" results are normal results, so they must validate too.
describe('MCP output schema contract for topic reads — real DB', () => {
  let caller: PrivateUser & { membership_plan: null }
  let admin: PrivateUser
  let cardA: string
  let cardB: string
  const missing = `missing-topic-${suffix}`

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    const seeded = await insertTestCardTopicsWithDataPoints({
      topics: [
        { name: `Contract Card A ${suffix}`, slug: `contract-card-a-${suffix}` },
        { name: `Contract Card B ${suffix}`, slug: `contract-card-b-${suffix}` },
      ],
      dataPoints,
    })
    caller = { ...seeded.user, membership_plan: null }
    ;[cardA, cardB] = seeded.topicIds as [string, string]
    await setTopicBestSortInputs(cardA, 7)
  })

  it('returns populated get_topic_insights', async () => {
    const result = await callStructuredMcpTool(caller, 'get_topic_insights', { topic_id: cardA }, [
      'data-points:read',
    ])

    expect(result).toMatchObject({ success: true, topic_id: cardA, approved_count: 1 })
    expect(result['median_credit_limits']).toEqual([{ amount: 1_500_000, currency: 'usd' }])
    expect(Object.keys(result['credit_score_distribution'] as object).length).toBeGreaterThan(0)
  })

  it('returns get_topic_insights for a topic without data points', async () => {
    const empty = await insertTestTopic({
      name: `Contract Empty ${suffix}`,
      slug: `contract-empty-${suffix}`,
      createdById: caller.id,
    })

    const result = await callStructuredMcpTool(caller, 'get_topic_insights', { topic_id: empty }, [
      'data-points:read',
    ])

    expect(result).toMatchObject({ success: true, total_count: 0, approval_rate: null })
  })

  it('returns populated get_topic_metrics', async () => {
    const result = await callStructuredMcpTool(caller, 'get_topic_metrics', { topic_id: cardA }, [
      'topics:read',
    ])

    expect(result).toMatchObject({ success: true, topic_id: cardA })
    expect(result['ratings']).toMatchObject({ count_4: 7 })
  })

  it('returns populated compare_topics', async () => {
    const result = await callStructuredMcpTool(
      caller,
      'compare_topics',
      { topic_id_a: cardA, topic_id_b: cardB },
      ['topics:read'],
    )

    expect(result).toMatchObject({
      success: true,
      topic_a: { topic_id: cardA, total_count: 3 },
      topic_b: { topic_id: cardB, total_count: 1 },
    })
  })

  it('returns get_topic_details for a card with its attributes resolved', async () => {
    const bank = await insertTestTopic({
      name: `Contract Bank ${suffix}`,
      slug: `contract-bank-${suffix}`,
      createdById: admin.id,
    })
    const brand = await insertTestTopic({
      name: `Contract Brand ${suffix}`,
      slug: `contract-brand-${suffix}`,
      createdById: admin.id,
    })
    const card = await getTopicByAny(cardA)
    await updateCardAttributes(admin, card!, {
      bank_topic_id: bank,
      brand_topic_id: brand,
      annual_fee: { amount: 9500, currency: 'usd' },
    })

    const result = await callStructuredMcpTool(caller, 'get_topic_details', { topic_id: cardA }, [
      'topics:read',
    ])

    expect(result).toMatchObject({
      success: true,
      id: cardA,
      topic_type: 'card',
      annual_fee: { amount: 9500, currency: 'usd' },
      bank_name: `Contract Bank ${suffix}`,
      brand_name: `Contract Brand ${suffix}`,
    })
  })

  it('returns get_topic_details for a rewards program with its company resolved', async () => {
    const company = await insertTestTopic({
      name: `Contract Company ${suffix}`,
      slug: `contract-company-${suffix}`,
      createdById: admin.id,
    })
    const program = await insertTestTopic({
      name: `Contract Program ${suffix}`,
      slug: `contract-program-${suffix}`,
      createdById: admin.id,
      topicType: 'rewards_program',
    })
    await updateRewardsProgramAttributes(admin, (await getTopicByAny(program))!, {
      company_topic_id: company,
    })

    const result = await callStructuredMcpTool(caller, 'get_topic_details', { topic_id: program }, [
      'topics:read',
    ])

    expect(result).toMatchObject({
      topic_type: 'rewards_program',
      rewards_program_company: `Contract Company ${suffix}`,
    })
  })

  it('returns get_topic_details for a plain topic and for a card without attributes', async () => {
    const plain = await insertTestTopic({
      name: `Contract Plain ${suffix}`,
      slug: `contract-plain-${suffix}`,
      createdById: caller.id,
    })

    const plainResult = await callStructuredMcpTool(
      caller,
      'get_topic_details',
      { topic_id: plain },
      ['topics:read'],
    )
    const bareCard = await callStructuredMcpTool(caller, 'get_topic_details', { topic_id: cardB }, [
      'topics:read',
    ])

    expect(plainResult).toMatchObject({ success: true, topic_type: 'topic' })
    expect(bareCard).toMatchObject({ success: true, annual_fee: null, bank_name: null })
  })

  it.each([
    ['get_topic_insights', { topic_id: missing }, 'data-points:read'],
    ['get_topic_metrics', { topic_id: missing }, 'topics:read'],
    ['get_topic_details', { topic_id: missing }, 'topics:read'],
    ['compare_topics', { topic_id_a: missing, topic_id_b: missing }, 'topics:read'],
  ] as const)('returns the not-found result of %s', async (name, args, scope) => {
    const result = await callStructuredMcpTool(caller, name, args, [scope])

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })
})
