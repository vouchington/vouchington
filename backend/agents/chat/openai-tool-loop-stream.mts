import type { PrivateUser } from '@services/users/types'
import { createRunEventWriter } from '@services/conversations-messages'
import {
  CHAT_OPENAI_MAX_RETRIES,
  DEFAULT_AGENT_MODEL,
  runToolLoopStreaming,
  type RunToolLoopResult,
  type SubagentToolCurryArgs,
} from '@agents/_shared'
import { SYSTEM_PROMPT } from './build-system-prompt.mts'
import { subagentBase } from './subagent-base.mts'
import { buildChatAgentTools } from './tools.mts'
import type { ChatStreamEvent } from './stream-types.mts'
import type { ChatHistoryMessage } from './build-input.mts'
import type { OpenAIResponseInputItem } from '@modules/openai-utils/create-response'

const MAX_ITERATIONS = 5

export async function* streamOpenAIToolLoop(params: {
  conversationId: string
  conversationMessageId: string
  agenticRunId: string
  currentUser: PrivateUser
  previousResponseId: string | undefined
  input: ChatHistoryMessage[]
  signal?: AbortSignal
  runLoopStreaming: typeof runToolLoopStreaming
}): AsyncGenerator<ChatStreamEvent, RunToolLoopResult> {
  const {
    conversationId,
    conversationMessageId,
    agenticRunId,
    currentUser,
    previousResponseId,
    input,
    signal,
    runLoopStreaming,
  } = params
  const subagentCurryArgs: SubagentToolCurryArgs = [
    conversationId,
    conversationMessageId,
    agenticRunId,
    signal,
  ]
  const agentTools = buildChatAgentTools(currentUser, subagentCurryArgs)
  const createAndUpdateRunEvent = createRunEventWriter(agenticRunId)

  const gen = runLoopStreaming({
    model: DEFAULT_AGENT_MODEL,
    instructions: SYSTEM_PROMPT,
    tools: agentTools,
    input: toOpenAIResponseInput(input),
    maxIterations: MAX_ITERATIONS,
    safetyIdentifier: currentUser.id,
    agentSlug: 'chat',
    previousResponseId,
    extraParams: { service_tier: 'flex', prompt_cache_key: 'chat-v1' },
    writeRunEvent: createAndUpdateRunEvent,
    signal,
    maxRetries: CHAT_OPENAI_MAX_RETRIES,
  })

  let step = await gen.next()
  while (!step.done) {
    const ev = step.value
    switch (ev.type) {
      case 'tool_call': {
        yield {
          type: 'tool_call',
          tool_call_id: ev.call_id,
          name: ev.name,
          arguments: ev.arguments,
        }
        break
      }
      case 'tool_result': {
        yield { type: 'tool_result', tool_call_id: ev.call_id, result: ev.output }
        break
      }
      case 'subagent_step': {
        yield { type: 'subagent_step', ...subagentBase(ev), tool_name: ev.tool_name }
        break
      }
      case 'subagent_text': {
        yield { type: 'subagent_text', ...subagentBase(ev), content: ev.content }
        break
      }
      case 'text': {
        yield { type: 'text', content: ev.content }
        break
      }
      case 'model_response': {
        break
      }
      default: {
        const unhandled: never = ev
        throw new Error(`Unhandled stream event type: ${JSON.stringify(unhandled)}`)
      }
    }
    step = await gen.next()
  }

  return step.value
}

function toOpenAIResponseInput(messages: ChatHistoryMessage[]): OpenAIResponseInputItem[] {
  return messages.map(message => ({
    type: 'message',
    role: message.role,
    content: message.content,
  }))
}
