import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  countAiUsageOpenAIResponseKeys,
  countAiUsageRecordsForResponseId,
  createTestFutureUtcDay,
  createTestPost,
  createTestUser,
  findAiUsageRecordForPost,
  insertTestCommunity,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { hasRecordedAiUsageResponseId, recordAiUsage } from '../record.mts'
import { getCommunityAiCostTotals } from '../totals.mts'

describe('recordAiUsage', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('inserts an ai_usage_records row and is reflected in getCommunityAiCostTotals', async () => {
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `ai-usage-record-test-${randomUUID().slice(0, 8)}`,
    })

    await recordAiUsage({
      communityId: community.id,
      postId: null,
      agentSlug: 'test-moderator',
      model: 'gpt-5.4-nano',
      serviceTier: 'flex',
      usage: { input_tokens: 200, output_tokens: 100 },
    })

    // getCommunityAiCostTotals orders DESC by cost with no time bound, so a community can sort past
    // any fixed-size page once enough ambient DB pollution outranks its cost. Walk the cursor to the
    // end instead of assuming this row lands in the first page.
    let entry: Awaited<ReturnType<typeof getCommunityAiCostTotals>>['results'][number] | undefined
    let after: string | undefined
    for (;;) {
      const page = await getCommunityAiCostTotals({ limit: 100, after })
      entry = page.results.find(t => t.community_id === community.id)
      if (entry || !page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }
    expect(entry).toBeDefined()
    expect(entry?.request_count).toBe(1)
    expect(entry?.total_input_tokens).toBe(200)
    expect(entry?.total_output_tokens).toBe(100)
    // gpt-5.4-nano flex: 200 in * 100_000/1M + 100 out * 625_000/1M = 82.5, rounds half-up to 83.
    expect(entry?.total_cost).toEqual({ amount: '83', currency: 'usd', scale: 6 })
    expect(entry?.unpriced_request_count).toBe(0)
  })

  it('persists a cached-token count clamped to reported input tokens', async () => {
    const post = await createTestPost({ user })

    await recordAiUsage({
      communityId: null,
      postId: post.id,
      agentSlug: 'test-cached-clamp',
      model: 'gpt-5.4-nano',
      serviceTier: 'flex',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 150 },
      },
    })

    const row = await findAiUsageRecordForPost(post.id, 'test-cached-clamp')
    // cached_tokens (150) exceeds input_tokens (100) -- the persisted column must reflect the
    // same clamp calcCostMicrounits applies, so the row's cost stays reproducible from its inputs.
    expect(row?.cached_input_tokens).toBe(100)
    expect(row?.input_tokens).toBe(100)
  })

  it('uses the provider-reported OpenRouter cost instead of local model pricing', async () => {
    const post = await createTestPost({ user })

    await recordAiUsage({
      responseId: `resp_openrouter_${randomUUID()}`,
      communityId: null,
      postId: post.id,
      agentSlug: 'test-openrouter-billed-cost',
      model: 'openai/gpt-5.4-nano',
      serviceTier: 'flex',
      usage: { input_tokens: 100, output_tokens: 50, cost: 0.001_234_5 },
    })

    const row = await findAiUsageRecordForPost(post.id, 'test-openrouter-billed-cost')
    expect(row?.pricing_status).toBe('priced')
    expect(row?.cost_microunits).toBe('1235')
  })

  it('records unknown pricing without treating it as zero-cost priced usage', async () => {
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `ai-usage-unpriced-test-${randomUUID().slice(0, 8)}`,
    })
    await recordAiUsage({
      communityId: community.id,
      postId: null,
      agentSlug: 'test-moderator',
      model: 'unknown-model',
      serviceTier: 'default',
      usage: { input_tokens: 10, output_tokens: 5 },
      // Backdated off today's UTC day on purpose (#8773 Finding 2): getCommunityAiCostTotals below
      // has no time predicate, so this row's day is otherwise free to pick, and
      // assertOpenAiSpendCapNotBreached fails closed on ANY unpriced row in *today's*
      // getDailyAiCostTotalMicrounits window -- an unpriced row landing on the real current day
      // would flakily 429 every other guarded-route test in this parallel Vitest project
      // (e.g. contact-drafts.test.mts's success cases) depending on commit order.
      createdAt: new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`),
    })
    // getCommunityAiCostTotals orders DESC by cost, so a zero-cost community ties with every other
    // zero-cost community from ambient DB pollution and can sort past any fixed-size page. Walk the
    // cursor to the end instead of assuming this row lands in the first page.
    let entry: Awaited<ReturnType<typeof getCommunityAiCostTotals>>['results'][number] | undefined
    let after: string | undefined
    for (;;) {
      const page = await getCommunityAiCostTotals({ limit: 100, after })
      entry = page.results.find(total => total.community_id === community.id)
      if (entry || !page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }
    expect(entry?.total_cost).toEqual({ amount: '0', currency: 'usd', scale: 6 })
    expect(entry?.unpriced_request_count).toBe(1)
  })

  it('records one ledger row when the same OpenAI response is replayed', async () => {
    const responseId = `resp_${randomUUID()}`
    const options = {
      responseId,
      agentSlug: 'test-response-id-replay',
      model: 'gpt-5.4-nano',
      serviceTier: 'flex',
      usage: { input_tokens: 11, output_tokens: 7 },
    }

    await expect(recordAiUsage(options)).resolves.toBe('recorded')
    await expect(recordAiUsage(options)).resolves.toBe('already-recorded')
    await expect(countAiUsageOpenAIResponseKeys(responseId)).resolves.toBe(1)
    await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
  })

  it('records one ledger row when concurrent callers use the same OpenAI response id', async () => {
    const responseId = `resp_${randomUUID()}`
    const options = {
      responseId,
      agentSlug: 'test-response-id-concurrent',
      model: 'gpt-5.4-nano',
      serviceTier: 'flex',
      usage: { input_tokens: 12, output_tokens: 8 },
    }

    const outcomes = await Promise.all(Array.from({ length: 8 }, () => recordAiUsage(options)))

    expect(outcomes.filter(outcome => outcome === 'recorded')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome === 'already-recorded')).toHaveLength(7)
    await expect(countAiUsageOpenAIResponseKeys(responseId)).resolves.toBe(1)
    await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
  })

  it('does not leave an idempotency key when the ledger insert fails', async () => {
    const responseId = `resp_${randomUUID()}`
    const options = {
      responseId,
      agentSlug: 'test-response-id-atomicity',
      model: 'gpt-5.4-nano',
      serviceTier: 'flex',
      usage: { input_tokens: -1, output_tokens: 9 },
    }

    await expect(recordAiUsage(options)).rejects.toThrow('violates check constraint')
    await expect(countAiUsageOpenAIResponseKeys(responseId)).resolves.toBe(0)

    await expect(
      recordAiUsage({ ...options, usage: { input_tokens: 13, output_tokens: 9 } }),
    ).resolves.toBe('recorded')
    await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
  })

  it('reports whether the response-id ledger fence exists', async () => {
    const responseId = `resp_${randomUUID()}`

    await expect(hasRecordedAiUsageResponseId(responseId)).resolves.toBe(false)
    await expect(
      recordAiUsage({
        responseId,
        agentSlug: 'test-response-id-fence',
        model: 'gpt-5.4-nano',
        serviceTier: 'flex',
        usage: { input_tokens: 13, output_tokens: 4 },
      }),
    ).resolves.toBe('recorded')
    await expect(hasRecordedAiUsageResponseId(responseId)).resolves.toBe(true)
  })
})
