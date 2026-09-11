import type { AgentModerationResults } from '@voucha/types'

export type { AgentModerationResults as AgentModerationStoredResults }

export type AiGeneratedModerationResult = AgentModerationResults & {
  confidence_score: number
  confidence_threshold: number
  classification: 'ai' | 'human'
  detector: string
  detector_model_version: string
}
