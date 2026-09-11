import type { Response } from 'openai/resources/responses/responses'
import { OpenAIResponseNotCompletedError, type OpenAIUsage } from './response-errors.mts'

export type OpenAIResponse = Pick<Response, 'id' | 'output'> & {
  status: 'completed'
  output_text: string
  usage?: OpenAIUsage
  // The model OpenAI actually served — a dated snapshot (e.g. `gpt-5.4-nano-2026-03-17`), not
  // necessarily the requested alias. Ledger writes must use this, not the request param, so a
  // routing mismatch is recorded rather than silently priced against the wrong model.
  model?: Response['model']
  service_tier?: Response['service_tier']
}

export function validateCompletedResponse(response: Response): OpenAIResponse {
  if (response.status === 'failed') {
    throw new OpenAIResponseNotCompletedError(
      `OpenAI response failed (${response.error?.code ?? 'unknown'}): ${response.error?.message ?? 'Unknown error'}`,
      response,
    )
  }
  if (response.status === 'incomplete') {
    throw new OpenAIResponseNotCompletedError(
      `OpenAI response incomplete: ${response.incomplete_details?.reason ?? 'unknown reason'}`,
      response,
    )
  }
  if (response.status !== 'completed') {
    throw new OpenAIResponseNotCompletedError(
      `OpenAI response has unsupported status: ${response.status ?? 'missing'}`,
      response,
    )
  }
  return {
    id: response.id,
    status: 'completed',
    output: response.output,
    output_text: computeOutputText(response),
    usage: response.usage,
    model: response.model,
    service_tier: response.service_tier,
  }
}

// The SDK only populates `response.output_text` via a post-processing step
// (`addOutputText`/`_thenUnwrap` in openai-node's `resources/responses/responses.mjs`) that runs on
// the resolved value of a non-streaming `.create()`/`.retrieve()` call. It never runs on individual
// SSE events, so `event.response.output_text` from a `response.completed`/`.failed`/`.incomplete`
// stream event is always `undefined` at runtime despite the SDK's `Response` type claiming it's a
// required `string` -- every OpenAIResponse in this module is stream-sourced, so trusting that field
// silently drops the text on every call. Recompute it the same way the SDK does: concatenate every
// `output_text` content part across every `message`-type output item.
function computeOutputText(response: Response): string {
  const texts: string[] = []
  for (const item of response.output) {
    if (item.type !== 'message') continue
    for (const content of item.content) {
      if (content.type === 'output_text') texts.push(content.text)
    }
  }
  return texts.join('')
}
