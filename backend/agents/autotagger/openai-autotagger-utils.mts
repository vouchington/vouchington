import type { OpenAIFunctionCall } from '@services/openai-agents'

export function createErrorObject(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }
  return {
    message: String(error),
  }
}

export function createToolCallsSignature(toolCalls: OpenAIFunctionCall[]): string {
  return JSON.stringify(
    toolCalls.map(toolCall => ({
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  )
}
