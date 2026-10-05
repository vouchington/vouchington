type SnapshotablePrompt = {
  prompt: string
  model_name: string
  model_provider: string
  is_slot_allocated: boolean
  activated_at: Date | null
  deactivated_at: Date | null
  deleted_at: Date | null
}

export function snapshotCommunityAgentPrompt(prompt: SnapshotablePrompt): Record<string, unknown> {
  return {
    prompt: prompt.prompt,
    model_name: prompt.model_name,
    model_provider: prompt.model_provider,
    is_slot_allocated: prompt.is_slot_allocated,
    activated_at: prompt.activated_at?.toISOString() ?? null,
    deactivated_at: prompt.deactivated_at?.toISOString() ?? null,
    deleted_at: prompt.deleted_at?.toISOString() ?? null,
  }
}
