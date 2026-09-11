type SnapshotablePrompt = {
  prompt: string
  model_name: string
  model_provider: string
  slot_allocated: boolean
  on_flag_action: string
  activated_at: Date | null
  deactivated_at: Date | null
  deleted_at: Date | null
}

export function snapshotCommunityAgentPrompt(prompt: SnapshotablePrompt): Record<string, unknown> {
  return {
    prompt: prompt.prompt,
    model_name: prompt.model_name,
    model_provider: prompt.model_provider,
    slot_allocated: prompt.slot_allocated,
    on_flag_action: prompt.on_flag_action,
    activated_at: prompt.activated_at?.toISOString() ?? null,
    deactivated_at: prompt.deactivated_at?.toISOString() ?? null,
    deleted_at: prompt.deleted_at?.toISOString() ?? null,
  }
}
