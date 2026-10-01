import type { ResponseStreamEvent } from 'openai/resources/responses/responses'
import { OpenAIResponseStreamIterationError } from './response-errors.mts'

/**
 * Yields every SSE event unchanged. A cancellation passes through as-is; any other failure while
 * iterating is wrapped with whether text had already been emitted, which is what separates upstream
 * weather before the first delta from a stream cut short mid-answer.
 */
export async function* iterateOpenAIResponseStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  hasEmittedTextDelta: () => boolean,
): AsyncGenerator<ResponseStreamEvent> {
  try {
    for await (const event of stream) yield event
  } catch (cause) {
    if (
      cause instanceof Error &&
      ['AbortError', 'APIUserAbortError', 'TimeoutError'].includes(cause.name)
    )
      throw cause
    throw new OpenAIResponseStreamIterationError(hasEmittedTextDelta(), { cause })
  }
}
