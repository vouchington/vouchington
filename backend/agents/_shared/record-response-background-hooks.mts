import { enqueueRecoverBackgroundResponse } from '@queues/ai-agents/enqueues/recover-background-response'
import { latchAccountingUncertainty } from '@services/ai-usage'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
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
        const job = getBackgroundResponseJobContext()
        try {
          if (job) {
            await job.register({
              responseId,
              agentSlug: params.agentSlug,
              communityId: params.communityId ?? null,
              postId: params.postId ?? null,
              createdAt: params.createdAt.toISOString(),
            })
            registration = { responseId, kind: 'job', createdAt: params.createdAt }
            return
          }
          await enqueueRecoverBackgroundResponse({
            responseId,
            agentSlug: params.agentSlug,
            communityId: params.communityId ?? null,
            postId: params.postId ?? null,
            createdAt: params.createdAt.toISOString(),
          })
          registration = { responseId, kind: 'recovery-job', createdAt: params.createdAt }
        } catch (err) {
          await latchAccountingUncertainty({
            requestDay: getUtcDayFromDate(params.createdAt),
            source: 'unknown_billed_attempt',
          })
          throw err
        }
      },
    },
    getRegistration: () => registration,
  }
}
