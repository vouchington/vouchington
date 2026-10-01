import onError from '@modules/on-error'
import { setDomainRateLimited } from '../../../services/crawls/domain-rate-limit.mts'

/** Fire-and-forget wrapper for tests that cannot await domain rate-limit setup. */
export function setDomainRateLimitedBackground(hostnameId: string, retryAfterMs?: number): void {
  setDomainRateLimited(hostnameId, retryAfterMs).catch(onError)
}
