import type { OpenAIResponse } from '../../../agents/_shared/create-response.mts'
import type { OpenAIFunctionCall } from '../../../services/openai-agents/index.mts'

export const makeTextResponse = (text: string, id = 'resp-1'): OpenAIResponse => ({
  id,
  status: 'completed',
  output: [
    {
      id: `${id}-message`,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [], logprobs: [] }],
    },
  ],
  output_text: text,
})

export const makeToolCallResponse = (id = 'resp-tool'): OpenAIResponse => ({
  id,
  status: 'completed',
  output: [
    {
      type: 'function_call',
      call_id: 'call-1',
      name: 'search_posts',
      arguments: '{}',
      status: 'completed',
    },
  ],
  output_text: '',
})

export const makeToolCall = (): OpenAIFunctionCall => ({
  type: 'function_call',
  call_id: 'call-1',
  name: 'search_posts',
  arguments: '{}',
})
