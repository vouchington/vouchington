export interface ChatConversation {
  id: string
  title: string
  created_at: string
  created_by_id: string
  updated_at: string
  updated_by_id: string | null
  deleted_at: string | null
  deleted_by_id: string | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  created_at: string
  created_by_id: string
  updated_at: string
  updated_by_id: string | null
  deleted_at: string | null
  deleted_by_id: string | null
  content: ChatMessageContent
}

export type ChatMessageContent =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; error?: string }

export interface ChatConversationsResponseBody {
  results: ChatConversation[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export interface ChatConversationResponseBody {
  conversation: ChatConversation
}

export interface ChatMessagesResponseBody {
  results: ChatMessage[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

// SSE event types — aligned with backend chat-stream.mts payloads
// Backend sends: event: <name>\ndata: <json>\n\n

export interface ChatSSEEventToolCall {
  tool_call_id: string
  name: string
  arguments: string
}

export interface ChatSSESubagentStep {
  agent_name: string
  tool_name: string
  tool_call_id?: string
}

export interface ChatSSESubagentText {
  agent_name: string
  tool_call_id?: string
  content: string
}
