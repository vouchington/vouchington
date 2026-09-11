import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { createCodedError } from '@modules/on-error/create-coded-error'
import {
  AGENT_RESPONSE_QUOTA_EXCEEDED,
  AGENT_RESPONSE_DISABLED,
  AGENT_RESPONSE_MAX_CONCURRENT,
} from '@modules/on-error/error-codes'
import type { MembershipPlanSlug } from '@services/memberships/types'
import { getAgentResponseQuotaFields } from './quota-config.mts'
import { countRunningAgentResponsesByUserId } from './create.mts'

const quotaRateLimiter = new RateLimiter({
  prefix: 'agent-response-quota',
  ttlSeconds: 24 * 60 * 60,
})

type UserForQuota = {
  id: string
  membership_plan?: MembershipPlanSlug | null
  roles: readonly string[]
}

function isAdmin(user: UserForQuota): boolean {
  return user.roles.includes('administrator')
}

function getDailyLimit(user: UserForQuota): number {
  if (isAdmin(user)) return Infinity
  const config = getAgentResponseQuotaFields()
  const plan = user.membership_plan ?? null
  if (plan === 'pro') return config.pro_daily
  if (plan === 'plus') return config.plus_daily
  return config.free_daily
}

export async function assertWithinAgentResponseQuota(user: UserForQuota): Promise<void> {
  if (isAdmin(user)) return

  const config = getAgentResponseQuotaFields()
  if (!config.enabled) {
    throw createCodedError(503, 'Agent responses are currently disabled.', AGENT_RESPONSE_DISABLED)
  }

  const limit = getDailyLimit(user)
  if (limit === Infinity) return

  // threshold = limit + 1 so users can make exactly `limit` calls.
  const { limited } = await quotaRateLimiter.addAndCheck([user.id], limit + 1)
  if (limited) {
    throw createCodedError(
      429,
      'Daily agent response quota exceeded. Please try again tomorrow.',
      AGENT_RESPONSE_QUOTA_EXCEEDED,
    )
  }
}

export async function assertWithinConcurrentAgentResponseLimit(user: UserForQuota): Promise<void> {
  if (isAdmin(user)) return

  const config = getAgentResponseQuotaFields()
  const running = await countRunningAgentResponsesByUserId(user.id)
  if (running >= config.max_concurrent) {
    throw createCodedError(
      409,
      `You already have ${running} agent response(s) running. Please wait for one to complete.`,
      AGENT_RESPONSE_MAX_CONCURRENT,
    )
  }
}
