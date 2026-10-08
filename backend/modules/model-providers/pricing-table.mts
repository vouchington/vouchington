import type { ModelProvider } from './types.mts'

/** Scale-six USD microunits per one million tokens (USD per million tokens x 1,000,000). */
export type TokenRates = {
  input: number
  cacheRead: number
  /** Null when the provider publishes no such cache-write rate, so such tokens cannot be priced. */
  cacheWrite5m: number | null
  cacheWrite1h: number | null
  output: number
}

/** The rates that apply while the whole prompt is at most `maxPromptTokens` tokens. */
export type PriceBand = { maxPromptTokens: number; rates: TokenRates }

/**
 * Sources, both read from the raw published tables (not a rendered page summary, which is
 * unreliable for numeric tables) on 2026-10-07:
 *
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing (the Model pricing table).
 *   Claude Haiku 5.5 is priced by prompt length: a prompt over 100,000 tokens (uncached input,
 *   cache writes and cache reads together) pays the higher input, cache and output prices.
 * - OpenAI: https://platform.openai.com/docs/pricing (the Standard, Flex and Fast tables, each with
 *   a short-context and a long-context group). The long-context group applies above 272K input
 *   tokens. Cache writes are billed only for explicit cache breakpoints, which no agent sets. OpenAI
 *   reports one cache-write count with no retention split, so it is kept in the 5-minute dimension.
 *
 * The price tier a response is billed at is the service tier the provider reports it served:
 * Anthropic `standard`; OpenAI `default` (Standard) and `flex`. Any other tier is unpriced.
 */
const ANY_PROMPT = Number.POSITIVE_INFINITY

export type PriceTable = Readonly<
  Record<ModelProvider, Readonly<Record<string, Readonly<Record<string, readonly PriceBand[]>>>>>
>

export const MODEL_PRICES = {
  anthropic: {
    'claude-haiku-5-5': {
      standard: [
        {
          maxPromptTokens: 100_000,
          rates: {
            input: 100_000,
            cacheWrite5m: 125_000,
            cacheWrite1h: 200_000,
            cacheRead: 10_000,
            output: 500_000,
          },
        },
        {
          maxPromptTokens: ANY_PROMPT,
          rates: {
            input: 500_000,
            cacheWrite5m: 625_000,
            cacheWrite1h: 1_000_000,
            cacheRead: 50_000,
            output: 2_500_000,
          },
        },
      ],
    },
  },
  openai: {
    'gpt-6-luna': {
      default: [
        {
          maxPromptTokens: 272_000,
          rates: {
            input: 100_000,
            cacheRead: 10_000,
            cacheWrite5m: 125_000,
            cacheWrite1h: null,
            output: 500_000,
          },
        },
        {
          maxPromptTokens: ANY_PROMPT,
          rates: {
            input: 200_000,
            cacheRead: 20_000,
            cacheWrite5m: 250_000,
            cacheWrite1h: null,
            output: 750_000,
          },
        },
      ],
      flex: [
        {
          maxPromptTokens: 272_000,
          rates: {
            input: 50_000,
            cacheRead: 5_000,
            cacheWrite5m: 62_500,
            cacheWrite1h: null,
            output: 250_000,
          },
        },
        {
          maxPromptTokens: ANY_PROMPT,
          rates: {
            input: 100_000,
            cacheRead: 10_000,
            cacheWrite5m: 125_000,
            cacheWrite1h: null,
            output: 375_000,
          },
        },
      ],
    },
  },
} as const satisfies PriceTable
