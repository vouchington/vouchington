import { ValkeyCache } from '@data-stores/valkey/cache'
import { runDetachedBackgroundWork } from '@modules/utils/detached-background-work'
import { getDomainBlacklistSourceTypeVersion } from '@voucha/types/entities/domain-blacklist-source'

const cache = new ValkeyCache({
  runBackgroundRefresh: runDetachedBackgroundWork,
  prefix: `email-domain-validation:${getDomainBlacklistSourceTypeVersion()}`,
  ttlSeconds: 3_600,
})

/** Reads only the caller's normalized domain through the actual cache owner. */
export async function readTestEmailDomainValidationCache(domain: string): Promise<unknown> {
  return cache.get(domain)
}

/** Invalidates exact caller-owned domains, including the owner's late-write fence. */
export async function deleteTestEmailDomainValidationCache(...domains: string[]): Promise<void> {
  await cache.invalidateCacheGetByAny(...domains)
}
