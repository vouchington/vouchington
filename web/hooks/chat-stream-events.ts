import type { ChatStreamHandlers } from './chat-stream-reader'

export function applyChatStreamEvent(
  eventType: string,
  data: Record<string, unknown>,
  handlers: ChatStreamHandlers,
): boolean {
  if (
    eventType === 'metadata' &&
    typeof data.conversation_id === 'string' &&
    typeof data.assistant_message_id === 'string'
  ) {
    handlers.setMetadata({
      conversationId: data.conversation_id,
      messageId: data.assistant_message_id,
    })
  } else if (
    (eventType === 'text' || eventType === 'message') &&
    typeof data.content === 'string'
  ) {
    handlers.appendContent(data.content)
  } else if (
    eventType === 'tool_call' &&
    typeof data.tool_call_id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.arguments === 'string'
  ) {
    handlers.appendToolCall({
      tool_call_id: data.tool_call_id,
      name: data.name,
      arguments: data.arguments,
    })
  } else if (
    eventType === 'subagent_step' &&
    typeof data.agent_name === 'string' &&
    typeof data.tool_name === 'string'
  ) {
    handlers.appendSubagentStep({
      agent_name: data.agent_name,
      tool_name: data.tool_name,
      ...(typeof data.tool_call_id === 'string' && { tool_call_id: data.tool_call_id }),
    })
  } else if (
    eventType === 'subagent_text' &&
    typeof data.agent_name === 'string' &&
    typeof data.content === 'string'
  ) {
    handlers.appendSubagentText({
      agent_name: data.agent_name,
      content: data.content,
      ...(typeof data.tool_call_id === 'string' && { tool_call_id: data.tool_call_id }),
    })
  } else if (eventType === 'error') {
    handlers.setError(typeof data.error === 'string' ? data.error : 'Unknown error')
    return true
  }
  return false
}
