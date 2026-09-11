import { DynamicConfig } from '@data-stores/valkey'

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
  const value = moderationConfig.getFields().ai_generated_confidence_threshold
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value
  }
  return DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD
}
