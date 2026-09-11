export interface BanEvasionSignalResult {
  matched: boolean
  score: number
  sourceUserId?: string
}

export interface BanEvasionDetectResult {
  flagged: boolean
  combinedScore: number
  sourceUserId: string | null
}
