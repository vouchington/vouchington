export type SpamSignalResult = {
  signal: string
  score: number
  flagged: boolean
  details?: Record<string, unknown>
}

export type SpamDetectionResult = {
  signals: SpamSignalResult[]
  composite_score: number
  flagged: boolean
}
