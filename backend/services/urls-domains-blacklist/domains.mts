import type { QueryOptions } from '@data-stores/psql/types'
import {
  EMPTY_HOSTNAME_POLICY,
  getFullHostnamePolicies,
  getHostnamePolicyGroups,
  getLocalHostnamePolicies,
  normalizeHostnameForPolicy,
  type HostnamePolicy,
} from '@services/urls-hostnames/policies'
import { resolveBlocklist } from './blocklist-lookup.mts'

export { normalizeDomain } from './normalize-domain.mts'
export { normalizeHostnameForPolicy }

/**
 * Blocking and Web Risk policy for many hostnames in one shared lookup, keyed by
 * `normalizeHostnameForPolicy(hostname)`. Every hostname suffix is considered.
 */
export async function getHostnamePolicies(
  hostnames: string[],
  options: QueryOptions = {},
): Promise<Map<string, HostnamePolicy>> {
  const groups = getHostnamePolicyGroups(hostnames)
  if (groups.length === 0) return new Map()
  return resolveBlocklist({
    groups,
    options,
    readLocal: pending => getLocalHostnamePolicies(pending, options),
    readFull: pending => getFullHostnamePolicies(pending, options),
  })
}

/** Adds domain-blocklist policy to an already-read local hostname policy map. */
export async function getHostnamePoliciesFromLocal(
  hostnames: string[],
  localPolicies: ReadonlyMap<string, HostnamePolicy>,
  options: QueryOptions = {},
): Promise<Map<string, HostnamePolicy>> {
  const groups = getHostnamePolicyGroups(hostnames)
  if (groups.length === 0) return new Map()
  const completeLocalPolicies = new Map(
    groups.map(({ key }) => [key, localPolicies.get(key) ?? EMPTY_HOSTNAME_POLICY]),
  )
  return resolveBlocklist({
    groups,
    options,
    readLocal: async () => completeLocalPolicies,
    readFull: pending => getFullHostnamePolicies(pending, options),
  })
}

export async function getHostnamePolicy(
  hostname: string,
  options: QueryOptions = {},
): Promise<HostnamePolicy> {
  const policies = await getHostnamePolicies([hostname], options)
  return policies.get(normalizeHostnameForPolicy(hostname)) ?? EMPTY_HOSTNAME_POLICY
}
