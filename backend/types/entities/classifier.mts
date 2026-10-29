export type ClassifierPrimitive = 'noul' | 'choice' | 'score' | 'agent'
export type ClassifierCandidateKind = 'topic' | 'story' | 'community_prompt'
export type ClassifierModelProvider = 'openai' | 'typesafe' | 'openrouter'

export type ClassifierThresholds = {
  lower: number
  upper: number
}
