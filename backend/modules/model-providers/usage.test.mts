import { describe, expect, it } from 'vitest'
import { anthropicUsageToModelUsage, openAIUsageToModelUsage } from './usage.mts'

describe('anthropicUsageToModelUsage', () => {
  it('makes input the whole prompt and splits cache writes by retention', () => {
    expect(
      anthropicUsageToModelUsage({
        input_tokens: 10,
        output_tokens: 50,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 70,
        cache_creation: { ephemeral_5m_input_tokens: 30, ephemeral_1h_input_tokens: 40 },
        output_tokens_details: { thinking_tokens: 20 },
      }),
    ).toEqual({
      inputTokens: 10 + 200 + 30 + 40,
      cacheReadTokens: 200,
      cacheWrite5mTokens: 30,
      cacheWrite1hTokens: 40,
      outputTokens: 50,
      reasoningOutputTokens: 20,
    })
  })

  it('treats an unsplit cache creation count as 5-minute writes', () => {
    expect(
      anthropicUsageToModelUsage({
        input_tokens: 5,
        output_tokens: 1,
        cache_creation_input_tokens: 9,
        cache_creation: null,
        cache_read_input_tokens: null,
      }),
    ).toMatchObject({ inputTokens: 14, cacheWrite5mTokens: 9, cacheWrite1hTokens: 0 })
  })
})

describe('openAIUsageToModelUsage', () => {
  it('keeps input as reported and carries cache, reasoning and reported cost', () => {
    expect(
      openAIUsageToModelUsage({
        input_tokens: 100,
        output_tokens: 40,
        input_tokens_details: { cached_tokens: 60, cache_write_tokens: 30 },
        output_tokens_details: { reasoning_tokens: 25 },
        cost: 0.002,
      }),
    ).toEqual({
      inputTokens: 100,
      cacheReadTokens: 60,
      cacheWrite5mTokens: 30,
      cacheWrite1hTokens: 0,
      outputTokens: 40,
      reasoningOutputTokens: 25,
      reportedCostUsd: 0.002,
    })
  })

  it('clamps reported cache counts so a stored row reproduces its cost', () => {
    expect(
      openAIUsageToModelUsage({
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 150, cache_write_tokens: 20 },
        output_tokens_details: { reasoning_tokens: 90 },
      }),
    ).toMatchObject({
      cacheReadTokens: 100,
      cacheWrite5mTokens: 0,
      reasoningOutputTokens: 50,
    })
  })
})
