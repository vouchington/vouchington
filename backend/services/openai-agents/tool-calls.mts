export type OpenAIFunctionCall = {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

export type OpenAIFunctionCallOutput = {
  type: 'function_call_output'
  call_id: string
  output: string
}

export function formatToolResult(callId: string, result: unknown): OpenAIFunctionCallOutput {
  return {
    type: 'function_call_output',
    call_id: callId,
    output: JSON.stringify(result),
  }
}

export function getFunctionCallsFromOutput(output: unknown): OpenAIFunctionCall[] {
  if (!Array.isArray(output)) {
    return []
  }

  return output.filter(item => {
    if (!item || typeof item !== 'object') {
      return false
    }
    const candidate = item as Partial<OpenAIFunctionCall>
    return (
      candidate.type === 'function_call' &&
      typeof candidate.call_id === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.arguments === 'string'
    )
  }) as OpenAIFunctionCall[]
}
