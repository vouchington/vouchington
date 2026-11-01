import { describe, expect, it } from 'vitest'
import {
  normalizeFixedClientGeneratedChatModelName,
  parseClientGeneratedChatModelProvider,
} from './model-providers.mts'

describe('model-providers', () => {
  it('maps client-generated chat providers to their local model names', () => {
    expect(parseClientGeneratedChatModelProvider('apple_foundation')).toBe('apple_foundation')
    expect(normalizeFixedClientGeneratedChatModelName('apple_foundation', undefined)).toBe(
      'apple-foundation-system',
    )
    expect(parseClientGeneratedChatModelProvider('windows_foundry')).toBe('windows_foundry')
    expect(normalizeFixedClientGeneratedChatModelName('windows_foundry', undefined)).toBe(
      'windows-system-language-model',
    )
    expect(parseClientGeneratedChatModelProvider('android_aicore')).toBe('android_aicore')
    expect(normalizeFixedClientGeneratedChatModelName('android_aicore', undefined)).toBe(
      'android-aicore-system',
    )
    expect(parseClientGeneratedChatModelProvider('openai_compatible')).toBe('openai_compatible')
  })

  it('rejects hosted model providers for client-generated chat', () => {
    expect(() => parseClientGeneratedChatModelProvider('openai')).toThrow(
      'Invalid client-generated chat provider',
    )
    expect(() => parseClientGeneratedChatModelProvider('anthropic')).toThrow(
      'Invalid client-generated chat provider',
    )
  })

  it('normalizes the deployed Windows model name to the canonical identity', () => {
    expect(normalizeFixedClientGeneratedChatModelName('windows_foundry', undefined)).toBe(
      'windows-system-language-model',
    )
    expect(normalizeFixedClientGeneratedChatModelName('windows_foundry', 'phi-silica')).toBe(
      'windows-system-language-model',
    )
  })

  it('rejects model names that do not belong to the fixed provider', () => {
    expect(() =>
      normalizeFixedClientGeneratedChatModelName('apple_foundation', 'phi-silica'),
    ).toThrow('model_name must be apple-foundation-system for apple_foundation')
  })
})
