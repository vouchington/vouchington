import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestFutureUtcDay,
  createTestPost,
  createTestUser,
  findAiUsageRecordForPost,
} from '@voucha/test-helpers'
import type { ModelUsage } from '@modules/model-providers/types'
import type { PrivateUser } from '@services/users/types'
import { recordAiUsage } from '../record.mts'

function usage(overrides: Partial<ModelUsage>): ModelUsage {
  return {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    ...overrides,
  }
}

describe('recordAiUsage across providers and transports', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  async function record(
    agentSlug: string,
    options: Omit<Parameters<typeof recordAiUsage>[0], 'agentSlug' | 'postId'>,
  ) {
    const post = await createTestPost({ user })
    await recordAiUsage({ ...options, agentSlug, postId: post.id })
    return findAiUsageRecordForPost(post.id, agentSlug)
  }

  it('records an Anthropic call with split cache writes at the base Haiku rates', async () => {
    const row = await record('test-anthropic-cache', {
      responseId: `msg_${randomUUID()}`,
      provider: 'anthropic',
      transport: 'direct',
      model: 'claude-haiku-5-5',
      serviceTier: 'standard',
      usage: usage({
        inputTokens: 80_000,
        cacheReadTokens: 40_000,
        cacheWrite5mTokens: 20_000,
        cacheWrite1hTokens: 10_000,
        outputTokens: 1_000,
        reasoningOutputTokens: 200,
      }),
    })

    expect(row).toMatchObject({
      model_provider: 'anthropic',
      provider_transport: 'direct',
      model: 'claude-haiku-5-5',
      service_tier_id: 'standard',
      input_tokens: 80_000,
      cached_input_tokens: 40_000,
      cache_write_5m_input_tokens: 20_000,
      cache_write_1h_input_tokens: 10_000,
      output_tokens: 1_000,
      reasoning_output_tokens: 200,
      pricing_status: 'priced',
      // 10k uncached * $0.10 + 40k read * $0.01 + 20k * $0.125 + 10k * $0.20 + 1k out * $0.50
      cost_microunits: String(1_000 + 400 + 2_500 + 2_000 + 500),
    })
  })

  it('prices a Haiku prompt over 100k tokens, output included, at the higher tier', async () => {
    const row = await record('test-anthropic-long-prompt', {
      responseId: `msg_${randomUUID()}`,
      provider: 'anthropic',
      transport: 'direct',
      model: 'claude-haiku-5-5',
      serviceTier: 'standard',
      usage: usage({ inputTokens: 200_000, outputTokens: 10_000 }),
    })

    // 200k * $0.50 + 10k * $2.50 per million.
    expect(row?.cost_microunits).toBe(String(100_000 + 25_000))
  })

  it('records the tokens of an OpenRouter call but takes its reported cost', async () => {
    const row = await record('test-openrouter-reported-cost', {
      responseId: `resp_${randomUUID()}`,
      provider: 'openai',
      transport: 'openrouter',
      model: 'gpt-6-luna-2026-10-01',
      serviceTier: 'flex',
      usage: usage({ inputTokens: 1_000, outputTokens: 100, reportedCostUsd: 0.000_321 }),
    })

    expect(row).toMatchObject({
      provider_transport: 'openrouter',
      input_tokens: 1_000,
      output_tokens: 100,
      cost_microunits: '321',
    })
  })

  it('records an unpriced served model with its tokens and no cost', async () => {
    const row = await record('test-unpriced-served-model', {
      provider: 'anthropic',
      transport: 'direct',
      model: 'claude-haiku-9-9',
      serviceTier: 'standard',
      usage: usage({ inputTokens: 12, outputTokens: 3 }),
      // Backdated off today's UTC day: an unpriced row on the current day would trip the daily
      // spend cap for every other guarded-route test in this parallel project.
      createdAt: new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`),
    })

    expect(row).toMatchObject({
      input_tokens: 12,
      output_tokens: 3,
      pricing_status: 'unpriced',
      cost_microunits: null,
    })
  })
})
