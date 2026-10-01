import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import type { OpenAIResponse } from '../create-response.mts'

export function tryExtractText(response: OpenAIResponse): string | null {
  try {
    return extractTextFromOpenAIResponse(response)
  } catch {
    return null
  }
}
