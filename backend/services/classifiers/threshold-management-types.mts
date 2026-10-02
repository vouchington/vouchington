import type {
  ClassifierCandidateKind,
  ClassifierModelProvider,
  ClassifierPrimitive,
} from '@voucha/types'

/** One immutable revision of a candidate's threshold override for one prompt version. */
export type ClassifierThresholdRevision = {
  id: string
  candidate_id: string
  prompt_version_id: string
  /** `null` means this bound inherits the prompt version default. */
  lower_threshold_override: number | null
  upper_threshold_override: number | null
  effective_lower_threshold: number
  effective_upper_threshold: number
  is_active: boolean
  activated_at: Date
  deactivated_at: Date | null
  created_by_id: string | null
  deactivated_by_id: string | null
}

export type StaffClassifierSummary = {
  id: string
  slug: string
  primitive: ClassifierPrimitive
  candidate_kind: ClassifierCandidateKind
  activated_at: Date | null
  deactivated_at: Date | null
  active_prompt_version: {
    id: string
    model_name: string
    model_provider: ClassifierModelProvider
    default_lower_threshold: number
    default_upper_threshold: number
    activated_at: Date | null
  } | null
}

export type StaffClassifierCandidate = {
  id: string
  candidate_kind: ClassifierCandidateKind
  topic_id: string | null
  story_id: string | null
  /** `null` for a global candidate; set for a candidate owned by one community. */
  community_id: string | null
  /** The active revision for the active prompt version; `null` only if none exists. */
  active_threshold: ClassifierThresholdRevision | null
}

/** Why a threshold change was not applied; the route maps each to an HTTP status. */
export type ClassifierThresholdChangeResult =
  | { outcome: 'changed' | 'unchanged'; threshold: ClassifierThresholdRevision }
  | { outcome: 'not_found' }
  | { outcome: 'invalid'; reason: string }
  | { outcome: 'conflict'; reason: string }
