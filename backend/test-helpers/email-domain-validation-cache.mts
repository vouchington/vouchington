import { ValkeyCache } from '@data-stores/valkey/cache'

const cache = new ValkeyCache({ prefix: 'email-domain-validation', ttlSeconds: 3_600 })

/** Reads only the caller's normalized domain through the actual cache owner. */
export async function readTestEmailDomainValidationCache(domain: string): Promise<unknown> {
  return cache.get(domain)
}

/** Invalidates exact caller-owned domains, including the owner's late-write fence. */
export async function deleteTestEmailDomainValidationCache(...domains: string[]): Promise<void> {
  await cache.invalidateCacheGetByAny(...domains)
}
