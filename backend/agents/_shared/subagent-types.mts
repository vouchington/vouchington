/** A real-time event yielded by a subagent executor. */
export type SubagentStepEvent =
  | { type: 'subagent_step'; agent_name: string; tool_name: string }
  | { type: 'subagent_text'; agent_name: string; content: string }
