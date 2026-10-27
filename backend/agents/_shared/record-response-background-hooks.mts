import { enqueueRecoverBackgroundResponse } from '@queues/ai-agents/enqueues/recover-background-response'
import onError from '@modules/on-error'
import { getBackgroundResponseJobContext } from './background-response-job-context.mts'
import type { BackgroundResponseHooks } from './create-response.mts'
import type { BackgroundResponseRegistration } from './record-response-usage-ledger.mts'

interface BackgroundResponseRegistrationParams {
  agentSlug: string
  communityId?: string | null
  postId?: string | null
  createdAt: Date
}

export function createBackgroundResponseRegistrationHooks(
  params: BackgroundResponseRegistrationParams,
): {
  hooks: BackgroundResponseHooks
  getRegistration: () => BackgroundResponseRegistration | undefined
} {
  let registration: BackgroundResponseRegistration | undefined
  return {
    hooks: {
      onResponseCreated: async responseId => {
        const response = {
          responseId,
          agentSlug: params.agentSlug,
          communityId: params.communityId ?? null,
          postId: params.postId ?? null,
          createdAt: params.createdAt.toISOString(),
        }
        try {
          // A job saves its own response id; an inline call admits a delayed job to check it.
          const job = getBackgroundResponseJobContext()
          await (job ? job.register(response) : enqueueRecoverBackgroundResponse(response))
          registration = { responseId, createdAt: params.createdAt }
          return true
        } catch (err) {
          // Recovery is a cheap guard against a paid replay. Losing it must not fail the call, but
          // an unsaved response stays an unknown billed attempt if the call then fails.
          onError(
            err instanceof Error
              ? err
              : new Error('Background response registration failed', { cause: err }),
          )
          return false
        }
      },
    },
    getRegistration: () => registration,
  }
}
