export type ModeratorOnFlagAction = 'none' | 'review_queue'

export type ActiveModeratorConfig = {
  moderator_id: string
  moderator_slug: string
  on_flag_action: ModeratorOnFlagAction
  is_baseline: boolean
  system_user_id: string
  prompt: {
    id: string
    prompt: string
    model_name: string
    model_provider: string
  }
}
