import type { Job } from 'glide-mq'
import type { AgentResponseJobData } from '@queues/ai-agents/types'
import {
  updateAgentResponseStarted,
  updateAgentResponseCompleted,
  updateAgentResponseFailed,
  releaseAgentResponseClaim,
} from '@services/agent-responses/update'
import { getPrivateUserByAny } from '@services/users'
import { streamResearchResponse } from '@agents/research-agent/respond'
import { publishAgentResponseEvent } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'
import { OpenAiSpendCapBreachError } from '@services/ai-usage'
import {
  RUNTIME_GENERATION_INTERRUPTED_ERROR,
  RUNTIME_GENERATION_INTERRUPTED_SIGNAL,
} from '@services/agent-responses/reconcile-runtime-generations'

export const WORKER_DEADLINE_MS = 8 * 60 * 1000 // 8 minutes
const MISSING_OWNER_ERROR = 'The response could not start. Please try again.'

export async function processAgentResponse(job: Job<AgentResponseJobData>): Promise<void> {
  const { agentResponseId } = job.data

  const agentResponse = await updateAgentResponseStarted(agentResponseId, job.id ?? agentResponseId)
  if (!agentResponse) return

  const currentUser = await getPrivateUserByAny(agentResponse.created_by_id)
  if (!currentUser) {
    await failAgentResponseForMissingOwner(agentResponseId)
    return
  }

  const abortController = new AbortController()
  const deadlineSignal = AbortSignal.timeout(WORKER_DEADLINE_MS)
  const combined = AbortSignal.any([abortController.signal, deadlineSignal])

  const signalInterval = setInterval(() => {
    if (job.signals?.some(s => s.name === RUNTIME_GENERATION_INTERRUPTED_SIGNAL)) {
      abortController.abort(RUNTIME_GENERATION_INTERRUPTED_SIGNAL)
    } else if (job.signals?.some(s => s.name === 'abort')) {
      abortController.abort()
    }
  }, 500).unref()

  try {
    const result = await streamResearchResponse({
      currentUser,
      task: agentResponse.input.task,
      context: agentResponse.input.context,
      agentResponseId,
      signal: combined,
    })

    const terminationReason =
      result.terminationReason === 'no_tool_calls' ||
      result.terminationReason === 'max_iterations' ||
      result.terminationReason === 'stalled' ||
      result.terminationReason === 'error'
        ? (result.terminationReason as 'no_tool_calls' | 'max_iterations' | 'stalled' | 'error')
        : 'no_tool_calls'

    const completed = await updateAgentResponseCompleted(
      agentResponseId,
      { content: result.content ?? '' },
      terminationReason,
    )

    if (completed) {
      await publishAgentResponseEvent(agentResponseId, {
        type: 'done',
        content: result.content ?? '',
      }).catch(onError)
    }
  } catch (error) {
    clearInterval(signalInterval)

    if (error instanceof OpenAiSpendCapBreachError) {
      await releaseAgentResponseClaim(agentResponseId)
      throw error
    }

    const err = error instanceof Error ? error : new Error(String(error))

    const runtimeGenerationInterrupted =
      error === RUNTIME_GENERATION_INTERRUPTED_SIGNAL ||
      combined.reason === RUNTIME_GENERATION_INTERRUPTED_SIGNAL
    if (
      runtimeGenerationInterrupted ||
      err.name === 'AbortError' ||
      err.name === 'APIUserAbortError' ||
      err.name === 'TimeoutError'
    ) {
      const failed = await updateAgentResponseFailed(
        agentResponseId,
        {
          message: runtimeGenerationInterrupted ? RUNTIME_GENERATION_INTERRUPTED_ERROR : 'Aborted',
        },
        'stalled',
      ).catch(error => {
        onError(error)
        return undefined
      })
      if (failed) {
        await publishAgentResponseEvent(agentResponseId, {
          type: 'error',
          error: runtimeGenerationInterrupted
            ? RUNTIME_GENERATION_INTERRUPTED_ERROR
            : 'Response was cancelled or timed out.',
        }).catch(onError)
      }
      return
    }

    onError(err)
    const failed = await updateAgentResponseFailed(
      agentResponseId,
      { message: 'An unexpected error occurred.' },
      'error',
    ).catch(error => {
      onError(error)
      return undefined
    })
    if (failed) {
      await publishAgentResponseEvent(agentResponseId, {
        type: 'error',
        error: 'An unexpected error occurred.',
      }).catch(onError)
    }
  } finally {
    clearInterval(signalInterval)
  }
}

async function failAgentResponseForMissingOwner(agentResponseId: string): Promise<boolean> {
  const failed = await updateAgentResponseFailed(
    agentResponseId,
    { message: MISSING_OWNER_ERROR },
    'error',
  )
  if (!failed) return false

  await publishAgentResponseEvent(agentResponseId, {
    type: 'error',
    error: MISSING_OWNER_ERROR,
  }).catch(onError)
  return true
}
