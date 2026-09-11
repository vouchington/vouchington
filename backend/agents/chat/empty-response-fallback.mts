import type { RunToolLoopResult } from '@agents/_shared'
import type { HostedChatModelProvider } from '@services/agents/model-providers'

export function getEmptyResponseFallbackMessage(
  modelProvider: HostedChatModelProvider,
  terminationReason: RunToolLoopResult['terminationReason'] | undefined,
): string {
  if (terminationReason === 'max_iterations') {
    return 'I was unable to complete your request after several attempts. Please try rephrasing your question.'
  }
  if (modelProvider === 'anthropic') {
    return "Sorry, Claude couldn't generate a response. Please try rephrasing your question."
  }
  return "Sorry, I couldn't generate a response. Please try rephrasing your question."
}
