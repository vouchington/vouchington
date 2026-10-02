import {
  acquireBackgroundResponseLease,
  type OwnedBackgroundResponseLease,
} from '@services/openai-background-responses'
import onError from '@modules/on-error'
import type { BackgroundResponseHooks } from './create-response.mts'
import type { BackgroundResponseRegistration } from './record-response-usage-ledger.mts'

interface BackgroundResponseRegistrationParams {
  agentSlug: string
  communityId?: string | null
  postId?: string | null
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
        let lease: OwnedBackgroundResponseLease | undefined
        try {
          lease = await acquireBackgroundResponseLease({ responseId, ...params })
        } catch (err) {
          onError(
            err instanceof Error
              ? err
              : new Error('Background response lease acquisition failed', { cause: err }),
          )
        }
        registration = { responseId, lease }
        return lease
      },
    },
    getRegistration: () => registration,
  }
}
