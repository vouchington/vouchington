import type { Response } from 'openai/resources/responses/responses'
import { validateCompletedResponse as validateResponse } from '@vouchington/ai/openai'
import type { OpenAIUsageLike as OpenAIUsage } from '@vouchington/ai/providers'

export type OpenAIResponse = Pick<Response, 'id' | 'output'> & {
  status: 'completed'
  output_text: string
  usage?: OpenAIUsage
  // The model OpenAI actually served — a dated snapshot (e.g. `gpt-6-luna-2026-10-01`), not
  // necessarily the requested alias. Ledger writes must use this, not the request param, so a
  // routing mismatch is recorded rather than silently priced against the wrong model.
  model?: Response['model']
  service_tier?: Response['service_tier']
}

export function validateCompletedResponse(response: Response): OpenAIResponse {
  const result = validateResponse(response)
  return {
    ...result,
    id: response.id,
    output: response.output,
    model: response.model,
    service_tier: response.service_tier,
  }
}
