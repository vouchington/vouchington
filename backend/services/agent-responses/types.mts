export type AgentName = 'research'

export type AgentResponseTerminationReason =
  | 'no_tool_calls'
  | 'max_iterations'
  | 'stalled'
  | 'error'

export type AgentResponseRecord = {
  id: string
  created_by_id: string
  agent: AgentName
  model_name: string | null
  model_provider: string | null
  job_id: string | null
  input: { task: string; context?: string }
  output: { content: string } | null
  error: { message: string } | null
  termination_reason: AgentResponseTerminationReason | null
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  deleted_at: Date | null
  created_at: Date
  updated_at: Date
}

export type CreateAgentResponseInput = {
  createdById: string
  agent: AgentName
  input: { task: string; context?: string }
  modelName?: string
  modelProvider?: string
}
