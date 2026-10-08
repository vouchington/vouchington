import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_SELECTION,
  describeInvalidModelSelection,
  describeInvalidOpenAITransport,
  MODEL_SERVICE_SLUGS,
  modelFieldName,
  providerFieldName,
} from './routing.mts'

describe('describeInvalidModelSelection', () => {
  it('accepts the default and a priced model of each provider', () => {
    expect(
      describeInvalidModelSelection(
        DEFAULT_MODEL_SELECTION.provider,
        DEFAULT_MODEL_SELECTION.model,
      ),
    ).toBeNull()
    expect(describeInvalidModelSelection('openai', 'gpt-6-luna')).toBeNull()
  })

  it('rejects an unknown provider, a model of the other provider and an unpriced model', () => {
    expect(describeInvalidModelSelection('google', 'gemini')).toMatch(/provider must be one of/)
    expect(describeInvalidModelSelection('anthropic', 'gpt-6-luna')).toMatch(
      /priced anthropic model/,
    )
    expect(describeInvalidModelSelection('openai', 'claude-haiku-5-5')).toMatch(
      /priced openai model/,
    )
    expect(describeInvalidModelSelection('openai', 'gpt-9')).toMatch(/priced openai model/)
    expect(describeInvalidModelSelection('openai', undefined)).toMatch(/priced openai model/)
  })
})

describe('describeInvalidOpenAITransport', () => {
  it('accepts openrouter and direct only', () => {
    expect(describeInvalidOpenAITransport('openrouter')).toBeNull()
    expect(describeInvalidOpenAITransport('direct')).toBeNull()
    expect(describeInvalidOpenAITransport('typesafe')).toMatch(/must be one of/)
  })
})

describe('service field names', () => {
  it('derives unique underscore field names from every service slug', () => {
    const names = MODEL_SERVICE_SLUGS.flatMap(slug => [
      providerFieldName(slug),
      modelFieldName(slug),
    ])
    expect(new Set(names).size).toBe(names.length)
    expect(providerFieldName('chat-generate-title')).toBe('chat_generate_title_provider')
  })
})
