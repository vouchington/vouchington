import type { SubagentStepEvent } from './subagent-types.mts'

export type RunToolLoopSubagentEvent = SubagentStepEvent & { tool_call_id?: string }

export type RunToolLoopStreamEvent =
  | { type: 'model_response'; response_id: string; iteration: number; tool_calls_count: number }
  | { type: 'tool_call'; call_id: string; name: string; arguments: string }
  | { type: 'tool_result'; call_id: string; output: string }
  | { type: 'text'; content: string }
  | RunToolLoopSubagentEvent
