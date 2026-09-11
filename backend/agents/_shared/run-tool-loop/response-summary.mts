import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import type { OpenAIResponse } from '../create-response.mts'

export function tryExtractText(response: OpenAIResponse): string | null {
  try {
    return extractTextFromOpenAIResponse(response)
  } catch {
    return null
  }
}

export function getResponseFinishReason(response: OpenAIResponse): string | null {
  const r = response as Record<string, unknown>
  if (typeof r.status === 'string') return r.status
  if (!Array.isArray(r.output)) return null
  for (const item of r.output) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).status === 'string'
    ) {
      return (item as Record<string, unknown>).status as string
    }
  }
  return null
}

export function extractResponseUsage(response: OpenAIResponse): unknown {
  const r = response as Record<string, unknown>
  return 'usage' in r ? r.usage : null
}
