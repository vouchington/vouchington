import { DynamicConfig } from '@data-stores/valkey'
import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'

export const DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD = 0.95

const DEFAULTS = {
  ai_generated_confidence_threshold: DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD,
}

export const moderationConfig = new DynamicConfig({
  key: 'moderation-config',
  fieldTypes: {
    ai_generated_confidence_threshold: 'number',
  },
  defaultFields: DEFAULTS,
})

export function getAiGeneratedConfidenceThreshold(): number {
  return normalizeAiGeneratedConfidenceThreshold(
    moderationConfig.getFields().ai_generated_confidence_threshold,
  )
}

export async function getFreshAiGeneratedConfidenceThreshold(
  config: Pick<DynamicConfig, 'key'> = moderationConfig,
): Promise<number> {
  const raw = await dynamicConfigPrimaryValkeyClient.hget(
    config.key,
    'ai_generated_confidence_threshold',
  )
  return normalizeAiGeneratedConfidenceThreshold(raw === null ? undefined : Number(raw.toString()))
}

function normalizeAiGeneratedConfidenceThreshold(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value
  }
  return DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD
}
