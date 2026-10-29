import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  countAiUsageRecordsForAgent,
  createTestFutureUtcDay,
  createTestPost,
  createTestUser,
  findAiUsageRecordForPost,
  insertTestCommunity,
  listAiUsageRecordsForClassifierRun,
} from '@voucha/test-helpers'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import type { PrivateUser } from '@services/users/types'
import { type ModelUsage, openAIUsageToModelUsage } from '@vouchington/ai/providers'
import { recordAiUsage } from '../record.mts'
import { getCommunityAiCostTotals } from '../totals.mts'

function usage(
  inputTokens: number,
  outputTokens: number,
  extra: Partial<ModelUsage> = {},
): ModelUsage {
  return {
    inputTokens,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens,
    reasoningOutputTokens: 0,
    ...extra,
  }
}

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
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage: usage(200, 100),
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
    // gpt-6-luna flex: 200 in * 50_000/1M + 100 out * 250_000/1M = 35.
    expect(entry?.total_cost).toEqual({ amount: '35', currency: 'usd', scale: 6 })
    expect(entry?.unpriced_request_count).toBe(0)
  })

  it('persists a cached-token count clamped to reported input tokens', async () => {
    const post = await createTestPost({ user })

    await recordAiUsage({
      communityId: null,
      postId: post.id,
      agentSlug: 'test-cached-clamp',
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage: openAIUsageToModelUsage({
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 150 },
      }),
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
      communityId: null,
      postId: post.id,
      agentSlug: 'test-openrouter-billed-cost',
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'openai/gpt-6-luna',
      serviceTier: 'flex',
      usage: usage(100, 50, { reportedCostUsd: 0.001_234_5 }),
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
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'unknown-model',
      serviceTier: 'default',
      usage: usage(10, 5),
      // Keep the fixture outside the current spend window so this totals test stays isolated.
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

  it('appends a second ledger row when the same usage is recorded again', async () => {
    const agentSlug = `test-usage-retry-${randomUUID()}`
    const options = {
      agentSlug,
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage: usage(11, 7),
    }

    await recordAiUsage(options)
    await recordAiUsage(options)
    await expect(
      countAiUsageRecordsForAgent(agentSlug, { inputTokens: 11, outputTokens: 7 }),
    ).resolves.toBe(2)
  })

  it('appends one row per concurrent call', async () => {
    const agentSlug = `test-usage-concurrent-${randomUUID()}`
    const options = {
      agentSlug,
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier: `future-Tier-${randomUUID()}`,
      usage: usage(12, 8, { reportedCostUsd: 0.001 }),
    }

    await Promise.all(Array.from({ length: 8 }, () => recordAiUsage(options)))
    await expect(
      countAiUsageRecordsForAgent(agentSlug, { inputTokens: 12, outputTokens: 8 }),
    ).resolves.toBe(8)
  })

  it('attributes each recorded call to its classifier run', async () => {
    const firstRunId = await reserveSyntheticRunId()
    const secondRunId = await reserveSyntheticRunId()
    const options = {
      agentSlug: 'test-classifier-attribution',
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage: usage(11, 7, { reportedCostUsd: 0.002 }),
    }

    await recordAiUsage({ ...options, classifierRunId: firstRunId, latencyMs: 120 })
    await recordAiUsage({ ...options, classifierRunId: secondRunId, latencyMs: 900 })

    expect(await listAiUsageRecordsForClassifierRun(firstRunId)).toEqual([
      expect.objectContaining({
        latency_milliseconds: 120,
        input_tokens: 11,
        cost_microunits: '2000',
      }),
    ])
    expect(await listAiUsageRecordsForClassifierRun(secondRunId)).toEqual([
      expect.objectContaining({
        latency_milliseconds: 900,
        input_tokens: 11,
        cost_microunits: '2000',
      }),
    ])
  })

  it('attributes usage to its run', async () => {
    const runId = await reserveSyntheticRunId()

    await recordAiUsage({
      agentSlug: 'test-classifier-attribution',
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage: usage(5, 2),
      classifierRunId: runId,
      latencyMs: 30,
    })

    expect(await listAiUsageRecordsForClassifierRun(runId)).toEqual([
      expect.objectContaining({ latency_milliseconds: 30, input_tokens: 5, output_tokens: 2 }),
    ])
  })

  it('can record a valid call after an invalid ledger insert', async () => {
    const agentSlug = `test-usage-insert-recovery-${randomUUID()}`
    const options = {
      agentSlug,
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage: usage(-1, 9),
    }

    await expect(recordAiUsage(options)).rejects.toThrow('violates check constraint')
    await recordAiUsage({ ...options, usage: usage(13, 9) })
    await expect(
      countAiUsageRecordsForAgent(agentSlug, { inputTokens: 13, outputTokens: 9 }),
    ).resolves.toBe(1)
  })
})
