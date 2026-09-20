export type ClassifierPrimitive = 'noul' | 'choice' | 'score'
export type ClassifierCandidateKind = 'topic' | 'story'
export type ClassifierScopeCategory = 'global' | 'community_ai'
export type ClassifierModelProvider = 'typesafe' | 'openrouter'

export type ClassifierThresholds = {
  lower: number
  upper: number
}

export type Classifier = {
  id: string
  slug: string
  primitive: ClassifierPrimitive
  candidate_kind: ClassifierCandidateKind
  activated_at: Date | null
  deactivated_at: Date | null
  created_at: Date
  deleted_at: Date | null
}

export type ClassifierPromptVersion = {
  id: string
  classifier_id: string
  prompt: string
  model_name: string
  model_provider: ClassifierModelProvider
  default_lower_threshold: number
  default_upper_threshold: number
  activated_at: Date | null
  deactivated_at: Date | null
  created_at: Date
  deleted_at: Date | null
}

export type ClassifierCandidate = {
  id: string
  classifier_id: string
  candidate_kind: ClassifierCandidateKind
  topic_id: string | null
  story_id: string | null
  community_id: string | null
  created_at: Date
  deleted_at: Date | null
}

export type ClassifierCandidateThreshold = {
  id: string
  classifier_id: string
  candidate_id: string
  prompt_version_id: string
  lower_threshold_override: number | null
  upper_threshold_override: number | null
  activated_at: Date
  deactivated_at: Date | null
  created_at: Date
}

export type ClassifierDecisionBatch = {
  id: string
  classifier_id: string
  prompt_version_id: string
  post_id: string | null
  rss_feed_item_id: string | null
  scope_category: ClassifierScopeCategory
  scope_community_id: string | null
  created_at: Date
}

export type ClassifierDecisionCall = {
  id: string
  batch_id: string
  shard_ordinal: number
  created_at: Date
}

type ClassifierResult = {
  id: string
  batch_id: string
  decision_call_id: string
  classifier_id: string
  candidate_id: string | null
  threshold_id: string | null
  prompt_version_id: string
  probability: number
  effective_lower_threshold: number
  effective_upper_threshold: number
  raw_response: unknown
  scope_category: ClassifierScopeCategory
  scope_community_id: string | null
  created_at: Date
}

export type TopicClassifierResult = ClassifierResult & {
  candidate_kind: 'topic'
  topic_id: string
}
export type StoryClassifierResult = ClassifierResult & {
  candidate_kind: 'story'
  story_id: string
}
