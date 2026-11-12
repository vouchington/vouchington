import {
  GEMINI_BATCH_MAX_VALUES,
  MIN_GEMINI_BATCH_STALE_HOURS,
} from '@services/embeddings/batch/config'

export function geminiField(
  key: keyof typeof GEMINI_BATCH_MAX_VALUES,
  description: string,
  minValue = key === 'stale_ttl_hours' ? MIN_GEMINI_BATCH_STALE_HOURS : 1,
) {
  return { description, minValue, maxValue: GEMINI_BATCH_MAX_VALUES[key], integer: true }
}
