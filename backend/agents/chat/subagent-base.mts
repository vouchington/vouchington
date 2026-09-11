export function subagentBase(event: { agent_name: string; tool_call_id?: string }) {
  return {
    agent_name: event.agent_name,
    ...(event.tool_call_id && { tool_call_id: event.tool_call_id }),
  }
}
