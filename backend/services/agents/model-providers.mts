import type { AgentModel, AgentModelProvider } from './types.mts'

export type HostedChatModelProvider = Extract<AgentModelProvider, 'openai' | 'anthropic'>
export type ClientGeneratedChatModelProvider = Extract<
  AgentModelProvider,
  'apple_foundation' | 'windows_foundry' | 'android_aicore' | 'openai_compatible'
>

export type FixedClientGeneratedChatModelProvider = Exclude<
  ClientGeneratedChatModelProvider,
  'openai_compatible'
>

export const CLIENT_GENERATED_CHAT_MODEL_BY_PROVIDER = {
  apple_foundation: 'apple-foundation-system',
  windows_foundry: 'windows-system-language-model',
  android_aicore: 'android-aicore-system',
} as const satisfies Record<FixedClientGeneratedChatModelProvider, AgentModel>

const LEGACY_CLIENT_GENERATED_CHAT_MODEL_BY_PROVIDER: Partial<
  Record<FixedClientGeneratedChatModelProvider, AgentModel>
> = {
  windows_foundry: 'phi-silica',
}

export const HOSTED_CHAT_MODEL_BY_PROVIDER = {
  openai: 'gpt-5.4-nano',
  anthropic: 'claude-sonnet-5',
} as const satisfies Record<HostedChatModelProvider, AgentModel>

export function parseHostedChatModelProvider(value: unknown): HostedChatModelProvider {
  if (value === undefined || value === null) return 'openai'
  if (value === 'openai' || value === 'anthropic') return value
  throw new Error('Invalid chat provider')
}

export function parseClientGeneratedChatModelProvider(
  value: unknown,
): ClientGeneratedChatModelProvider {
  if (
    value === 'apple_foundation' ||
    value === 'windows_foundry' ||
    value === 'android_aicore' ||
    value === 'openai_compatible'
  ) {
    return value
  }
  throw new Error('Invalid client-generated chat provider')
}

export function normalizeFixedClientGeneratedChatModelName(
  provider: FixedClientGeneratedChatModelProvider,
  value: unknown,
): AgentModel {
  const canonicalModelName = CLIENT_GENERATED_CHAT_MODEL_BY_PROVIDER[provider]
  if (
    value === undefined ||
    value === canonicalModelName ||
    value === LEGACY_CLIENT_GENERATED_CHAT_MODEL_BY_PROVIDER[provider]
  ) {
    return canonicalModelName
  }
  throw new Error(`model_name must be ${canonicalModelName} for ${provider}`)
}
