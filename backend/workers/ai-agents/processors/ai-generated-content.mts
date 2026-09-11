import { formatPercent } from '@ts-shared/utils/format'
import { getAiGeneratedConfidenceThreshold } from '@services/moderation/config'
import type { AiGeneratedModerationResult } from '@services/moderation/results'
import { detectAiGeneratedText } from '@jongleberry/vurst-ai'

export async function detectAiGeneratedModeration(
  text: string,
  options?: { confidenceThreshold?: number },
): Promise<AiGeneratedModerationResult> {
  const confidenceThreshold = options?.confidenceThreshold ?? getAiGeneratedConfidenceThreshold()
  const detection = await detectAiGeneratedText(Buffer.from(text, 'utf-8'), confidenceThreshold)

  return {
    flagged: detection.flagged,
    reason: buildReason(
      detection.confidenceScore,
      detection.confidenceThreshold,
      detection.flagged,
    ),
    confidence_score: detection.confidenceScore,
    confidence_threshold: detection.confidenceThreshold,
    classification: detection.classification as 'ai' | 'human',
    detector: detection.detector,
    detector_model_version: detection.detectorModelVersion,
  }
}

function buildReason(
  confidenceScore: number,
  confidenceThreshold: number,
  flagged: boolean,
): string {
  const confidence = formatPercent(confidenceScore)
  const threshold = formatPercent(confidenceThreshold)

  const message = flagged ? 'Detected as AI-generated' : 'Did not meet the AI-generated threshold'

  return `${message} (${confidence} confidence; threshold ${threshold}).`
}
