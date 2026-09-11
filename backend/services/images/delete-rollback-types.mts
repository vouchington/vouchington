export type ImageDeleteImageRollback = {
  openai_omni_moderation_results: unknown | null
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_created_at: Date | null
}

export type ImageDeletePostRollback = {
  post_id: string
  revision_id: string | null
  latest_clearance_change_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
  spam_detection_flagged: boolean | null
  spam_detection_created_at: Date | null
  spam_detection_score: number | null
  spam_detection_results: unknown | null
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_created_at: Date | null
  deleted_content_sha256: Buffer | null
}

export type ImageDeleteResult =
  | {
      affectedPostIds: []
      deletedThisImage: false
      imageRollback: null
      postRollbacks: []
    }
  | {
      affectedPostIds: string[]
      deletedThisImage: true
      imageRollback: ImageDeleteImageRollback
      postRollbacks: ImageDeletePostRollback[]
    }
