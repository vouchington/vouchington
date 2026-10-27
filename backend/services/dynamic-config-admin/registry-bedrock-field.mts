import { BEDROCK_BATCH_MAX_VALUES } from '@services/bedrock-embeddings/batch/config'

export function bedrockField(
  key: keyof typeof BEDROCK_BATCH_MAX_VALUES,
  description: string,
  minValue = 1,
) {
  return { description, minValue, maxValue: BEDROCK_BATCH_MAX_VALUES[key], integer: true }
}
