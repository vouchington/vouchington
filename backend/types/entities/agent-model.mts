export type AgentModel =
  | 'gpt-5.4-nano'
  | 'apple-foundation-system'
  | 'claude-sonnet-5'
  | 'phi-silica'
  | 'windows-system-language-model'
  | 'android-aicore-system'

export type AgentModelProvider =
  | 'openai'
  | 'apple_foundation'
  | 'anthropic'
  | 'windows_foundry'
  | 'android_aicore'
  | 'openai_compatible'
