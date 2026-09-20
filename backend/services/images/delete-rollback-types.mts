export type ImageDeleteImageRollback = {
  openai_omni_moderation_results: unknown | null
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_created_at: Date | null
}

export type ImageDeletePostRollback = {
  post_id: string
  revision_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
  clearance_change_id: string | null
  clearance_changed_by_id: string | null
  clearance_public_reason_code: string | null
  clearance_private_note: string | null
  clearance_platform_override: boolean
  llm_moderation_content_sha256: Buffer
  clearance_reset: boolean
  deleted_content_sha256: Buffer | null
  deleted_clearance_change_id: string | null
}

export type ImagePlacementRetirement = { placementId: string; revision: number }

export type ImageDeleteResult =
  | {
      affectedPostIds: []
      deletedThisImage: false
      imageRollback: null
      postRollbacks: []
      retiredPlacements: []
    }
  | {
      affectedPostIds: string[]
      deletedThisImage: true
      imageRollback: ImageDeleteImageRollback
      postRollbacks: ImageDeletePostRollback[]
      retiredPlacements: ImagePlacementRetirement[]
    }
