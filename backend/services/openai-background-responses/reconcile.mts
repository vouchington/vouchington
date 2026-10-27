import onError from '@modules/on-error'
import { recordAiUsage } from '@services/ai-usage'
import {
  isOpenAIResponseNotCompletedError,
  isOpenAINotFoundError,
  validateCompletedResponse,
} from '@vouchington/ai/openai'
import { retrieveOpenAIResponse, cancelOpenAIResponse } from '@modules/openai-utils/create-response'
import { openAIUsageToModelUsage, type OpenAIUsageLike } from '@vouchington/ai/providers'
import type { BackgroundResponseToReconcile } from './types.mts'

export type ReconcileBackgroundResponseResult = 'still-active' | 'settled'

type TerminalResponse = {
  usage?: OpenAIUsageLike | null
  model?: string
  service_tier?: string | null
}

/**
 * Checks a saved response before a paid replay. Usage is recorded best effort: a missing or
 * unwritable record is reported and dropped, since billing is downstream reporting. A response
 * still running is cancelled for a replaying worker, and left alone for the delayed recovery job
 * of an inline call, whose caller may still be waiting on it.
 */
export async function reconcileBackgroundResponse(
  candidate: BackgroundResponseToReconcile,
  mode: 'worker' | 'inline',
): Promise<ReconcileBackgroundResponseResult> {
  let raw: Awaited<ReturnType<typeof retrieveOpenAIResponse>>
  try {
    raw = await retrieveOpenAIResponse(candidate.responseId)
  } catch (err) {
    if (isOpenAINotFoundError(err)) return 'settled'
    throw err
  }

  let terminal: TerminalResponse
  try {
    terminal = validateCompletedResponse(raw)
  } catch (err) {
    if (!isOpenAIResponseNotCompletedError(err)) throw err
    if (err.status !== 'failed' && err.status !== 'incomplete' && err.status !== 'cancelled') {
      if (mode === 'inline') return 'still-active'
      await cancelOpenAIResponse(candidate.responseId)
      return 'settled'
    }
    terminal = err
  }
  if (terminal.usage) await recordBestEffort(candidate, terminal.usage, terminal)
  return 'settled'
}

async function recordBestEffort(
  candidate: BackgroundResponseToReconcile,
  usage: OpenAIUsageLike,
  response: TerminalResponse,
): Promise<void> {
  try {
    await recordAiUsage({
      responseId: candidate.responseId,
      agentSlug: candidate.agentSlug,
      communityId: candidate.communityId,
      postId: candidate.postId,
      provider: 'openai',
      transport: 'direct',
      model: response.model ?? 'unknown-model',
      serviceTier: response.service_tier ?? 'unknown-tier',
      usage: openAIUsageToModelUsage(usage),
      createdAt: candidate.createdAt,
    })
  } catch (err) {
    onError(
      err instanceof Error
        ? err
        : new Error('Background OpenAI usage write failed', { cause: err }),
    )
  }
}
