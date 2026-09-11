/**
 * Extracts text from OpenAI Responses API output.
 *
 * The Responses API can return output in different formats:
 * - An array with reasoning and message objects (structured output in message's content)
 * - A simple object with a 'text' property
 *
 * @param response - The response from OpenAI Responses API
 * @returns The extracted text string
 * @throws Error if the output format is unexpected or missing
 */
export const extractTextFromOpenAIResponse = (response: unknown): string => {
  if (typeof response !== 'object' || response === null) {
    throw new Error('Unexpected response format: response is not an object')
  }

  const responseObj = response as Record<string, unknown>
  if (!('output' in responseObj) || !responseObj.output) {
    throw new Error('Unexpected response format: missing output')
  }

  const output = responseObj.output

  // The Responses API returns an array with reasoning and message objects
  // The structured output is in the message's content[0].text
  let text: string
  if (Array.isArray(output)) {
    const message = output.find((item: unknown) => {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>
        return obj.type === 'message' && obj.status === 'completed'
      }
      return false
    }) as { content?: Array<{ type: string; text?: string }> } | undefined
    if (
      !message ||
      !message.content ||
      !Array.isArray(message.content) ||
      message.content.length === 0
    ) {
      throw new Error(`Unexpected output format: ${JSON.stringify(output)}`)
    }
    const textContent = message.content.find(
      (c: { type: string; text?: string }) => c.type === 'output_text',
    )
    if (!textContent || typeof textContent.text !== 'string') {
      throw new Error(`Unexpected output format: ${JSON.stringify(output)}`)
    }
    text = textContent.text
  } else if (typeof output === 'object' && 'text' in output) {
    const outputWithText = output as { text: string }
    if (typeof outputWithText.text === 'string') {
      text = outputWithText.text
    } else {
      throw new TypeError(`Unexpected output format: ${JSON.stringify(output)}`)
    }
  } else {
    throw new Error(`Unexpected output format: ${JSON.stringify(output)}`)
  }

  return text
}
