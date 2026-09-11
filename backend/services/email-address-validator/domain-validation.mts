import { ValkeyCache } from '@data-stores/valkey/cache'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { EmailDomainInvalidError } from './errors.mts'
import { checkEmailBloomFilter } from '@services/urls-domains-blacklist'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import { resolveMxRecords, DnsTimeoutError } from './resolve-mx.mts'

const CACHE_TTL_SECONDS = 3600 // 1 hour
let resolveMxRecordsForValidation = resolveMxRecords

type DomainValidationResult = { success: true } | { success: false; reason: string }

const cache = new ValkeyCache<string>({
  prefix: 'email-domain-validation',
  ttlSeconds: CACHE_TTL_SECONDS,
})

async function performDomainValidation(normalizedDomain: string): Promise<DomainValidationResult> {
  // `!== false` treats missing/undefined as enabled — matches defaultFields: { emailBlocklistBloomFilterEnabled: true }
  const emailBlocklistBloomFilterEnabled =
    bloomFilterConfig.fields.get('emailBlocklistBloomFilterEnabled') !== false

  let emailable: boolean | null
  let is_blacklisted: boolean

  if (emailBlocklistBloomFilterEnabled) {
    const bloomResult = await checkEmailBloomFilter(normalizedDomain)
    if (bloomResult === false) {
      // Bloom filter says definitely not in email blocklist — skip the EXISTS subquery.
      // Trade-off: domains added to the blacklist after the last bloom filter rebuild
      // (weekly) will pass this check until the filter is rebuilt. A cached "valid"
      // result (CACHE_TTL_SECONDS = 1hr) can further extend that window. This is
      // acceptable because false negatives here are transient and bounded; the filter
      // is rebuilt weekly, and the bloom filter fast path only affects the no-op common
      // case (legitimate domains that are definitely not blocked).
      const result = await checkHostnameEmailabilityWithoutBlacklist(normalizedDomain)
      emailable = result.emailable
      is_blacklisted = false
    } else {
      const result = await checkHostnameEmailability(normalizedDomain)
      emailable = result.emailable
      is_blacklisted = result.is_blacklisted
    }
  } else {
    const result = await checkHostnameEmailability(normalizedDomain)
    emailable = result.emailable
    is_blacklisted = result.is_blacklisted
  }

  if (emailable === false)
    return { success: false, reason: 'domain marked as not emailable in database' }
  if (is_blacklisted) return { success: false, reason: 'disposable' }

  try {
    const mxRecords = await resolveMxRecordsForValidation(normalizedDomain)
    if (!mxRecords || mxRecords.length === 0)
      return { success: false, reason: 'no MX records found' }
  } catch (error) {
    // DnsTimeoutError is transient — throw EmailDomainInvalidError so it propagates
    // uncached: cacheGetByAny does not cache thrown errors. Caching a timeout would
    // mark a valid domain as invalid for the full TTL.
    if (error instanceof DnsTimeoutError) {
      throw new EmailDomainInvalidError(normalizedDomain, `DNS error: ${error.message}`)
    }
    return {
      success: false,
      reason: `DNS error: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }

  return { success: true }
}

const performDomainValidationCached = cache.cacheGetByAny(performDomainValidation)

export async function validateEmailDomain(domain: string): Promise<void> {
  const normalizedDomain = domain.toLowerCase().trim()
  const result = await performDomainValidationCached(normalizedDomain)
  if (!result || !result.success) {
    throw new EmailDomainInvalidError(normalizedDomain, result?.reason ?? 'domain is not valid')
  }
}

export function setResolveMxRecordsForDomainValidationTest(
  override: typeof resolveMxRecords,
): () => void {
  const previous = resolveMxRecordsForValidation
  resolveMxRecordsForValidation = override
  return () => {
    resolveMxRecordsForValidation = previous
  }
}

type HostnameEmailabilityResult = {
  emailable: boolean | null
  is_blacklisted: boolean
}

type HostnameEmailabilityWithoutBlacklistResult = {
  emailable: boolean | null
}

async function checkHostnameEmailability(domain: string): Promise<HostnameEmailabilityResult> {
  const result = await read(sql`/* checkHostnameEmailability */
    SELECT
      uh.emailable,
      EXISTS (
        SELECT 1 FROM domain_blacklists db
        INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
        WHERE db.domain = ${domain} AND dbs.type = 'email'::domain_blacklist_types
      ) AS is_blacklisted
    FROM (SELECT ${domain} AS hostname) AS d
    LEFT JOIN url_hostnames uh ON uh.hostname = d.hostname
    LIMIT 1
  `)

  return {
    emailable: result.rows[0].emailable,
    is_blacklisted: result.rows[0].is_blacklisted,
  }
}

async function checkHostnameEmailabilityWithoutBlacklist(
  domain: string,
): Promise<HostnameEmailabilityWithoutBlacklistResult> {
  const result = await read(sql`/* checkHostnameEmailabilityWithoutBlacklist */
    SELECT uh.emailable
    FROM (SELECT ${domain} AS hostname) AS d
    LEFT JOIN url_hostnames uh ON uh.hostname = d.hostname
    LIMIT 1
  `)

  return { emailable: result.rows[0].emailable }
}
