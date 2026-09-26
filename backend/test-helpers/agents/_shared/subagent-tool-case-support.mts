import {
  createConversation,
  createConversationMessage,
} from '../../../services/conversations-messages/create.mts'
import {
  streamOpenAIResponse,
  type OpenAIResponse,
} from '../../../modules/openai-utils/create-response.mts'
import type {
  SubagentResult,
  SubagentStepEvent,
  SubagentToolCurryArgs,
} from '../../../agents/_shared/subagent-tool.mts'
import {
  createMockTextResponse,
  drainSubagentExecutor,
} from '@voucha/test-helpers/subagent-test-utils'

export type AgentTool = {
  schema: { name: string; type: string; parameters: unknown }
  function: (user: unknown, ...args: SubagentToolCurryArgs) => unknown
}

export type SubagentToolCaseConfig = {
  label: string
  schemaName: string
  inputKey: 'query' | 'task'
  summaryText: string
  summaryResponseId: string
  summaryConversation: string
  summaryInput: string
  contextConversation: string
  contextResponseId: string
  contextResult: string
  contextInput: string
  contextText: string
  inputContentType: string
  contextContentType: string
  retryConversation: string
  retryInput: string
  errorConversation: string
  errorInput: string
}

export function makeNoTextStream(response: OpenAIResponse) {
  return async function* (): AsyncGenerator<{ delta: string }, OpenAIResponse> {
    yield* []
    return response
  }
}

export async function seedSubagentMessage(userId: string, title: string) {
  const conversation = await createConversation(userId, title)
  const message = await createConversationMessage(conversation.id, userId, {
    role: 'assistant',
    content: null,
  })
  return { conversation, message }
}

export function runSubagentTool(
  tool: AgentTool,
  user: unknown,
  conversationId: string,
  messageId: string,
  parentRunId: string,
  args: Record<string, string>,
) {
  const execute = tool.function(user, conversationId, messageId, parentRunId, undefined) as (
    input: Record<string, string>,
  ) => AsyncGenerator<SubagentStepEvent, SubagentResult>
  return drainSubagentExecutor(execute(args))
}

export function mockTextResponse(responseId: string, text: string) {
  return makeNoTextStream(createMockTextResponse(responseId, text))
}

export { streamOpenAIResponse }
