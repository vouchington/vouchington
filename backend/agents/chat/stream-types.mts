export type ChatStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool_call_id: string; name: string; arguments: string }
  | { type: 'tool_result'; tool_call_id: string; result: string }
  | ({ type: 'subagent_step'; tool_name: string } & ChatSubagentEventBase)
  | ({ type: 'subagent_text'; content: string } & ChatSubagentEventBase)
  | { type: 'done' }
  | { type: 'error'; error: string }

type ChatSubagentEventBase = { agent_name: string; tool_call_id?: string }
