export type AgentModerationResults = {
  flagged: boolean
  categories?: string[]
  confidence_score?: number
  confidence_threshold?: number
  classification?: 'ai' | 'human'
  detector?: string
  detector_model_version?: string
}
