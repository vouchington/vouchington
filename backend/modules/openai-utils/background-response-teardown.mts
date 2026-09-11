import type { Response } from 'openai/resources/responses/responses'
import openai from './client.mts'

// Background responses keep billing after this process stops caring if nobody stops them — see
// the registry + sweeper in backend/services/openai-background-responses (#8836). Both teardown
// seams below use maxRetries: 0 and a short timeout because they run on abort/shutdown paths and
// must never retry-storm; retrying a cancel/retrieve that's already failing only delays shutdown.
const BACKGROUND_TEARDOWN_TIMEOUT_MS = 10_000

/**
 * Cancels a background response, stopping the meter. Only stops spend — it does not reliably
 * carry usage synchronously (a cancelled background response's usage can lag ~10s behind the
 * cancel call; see the background-mode spike in docs/overview/architecture/openai-cost-model.md),
 * so callers must not treat this as the usage-recording step. The registry sweeper's
 * retrieveOpenAIResponse() is what records usage for a response cancelled here.
 */
/* no-mistakes: integration=openai */
export async function cancelOpenAIResponse(responseId: string): Promise<Response> {
  return await openai.responses.cancel(responseId, {
    maxRetries: 0,
    timeout: BACKGROUND_TEARDOWN_TIMEOUT_MS,
  })
}

/** Retrieves a background response's current terminal state, for the sweeper to record from. */
/* no-mistakes: integration=openai */
export async function retrieveOpenAIResponse(responseId: string): Promise<Response> {
  return await openai.responses.retrieve(responseId, undefined, {
    maxRetries: 0,
    timeout: BACKGROUND_TEARDOWN_TIMEOUT_MS,
  })
}
