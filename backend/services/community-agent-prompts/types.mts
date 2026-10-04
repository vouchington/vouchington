export type CommunityAgentPrompt = {
  id: string
  community_id: string
  created_by_id: string | null
  agent_id: string
  prompt: string
  model_name: string
  model_provider: string
  slot_allocated: boolean
  activated_at: Date | null
  deactivated_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  deleted_by_id: string | null
}
