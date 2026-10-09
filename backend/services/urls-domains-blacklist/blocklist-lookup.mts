import type { QueryOptions } from '@data-stores/psql/types'
import { getBlocklistedDomainKeys, type CandidateGroup } from '@services/urls-hostnames/policies'
import { checkBloomFilters, isUrlBlocklistBloomFilterEnabled } from './bloom-filter.mts'

type BlockableRow = { is_blocked: boolean }

type ResolveBlocklistInput<Row extends BlockableRow> = {
  groups: CandidateGroup[]
  options?: QueryOptions
  /** Local (non-`blocklisted_domains`) answer per group key, aligned with `groups`. */
  readLocal: (groups: CandidateGroup[]) => Promise<Map<string, Row>>
  /** Local plus `blocklisted_domains` answer per group key in one query. */
  readFull: (groups: CandidateGroup[]) => Promise<Map<string, Row>>
}

/**
 * Owns the "Bloom, local, blocklisted_domains" decision for every URL blocklist consumer.
 *
 * Bloom enabled: the Bloom read and the local read run concurrently, so a definite negative costs
 * one round trip of depth. `blocklisted_domains` is queried only for groups that are not already
 * blocked locally and whose Bloom answer is "maybe" or unknown (not ready, partial, or errored).
 * Bloom disabled, or a caller that needs read-after-write: one full query.
 */
export async function resolveBlocklist<Row extends BlockableRow>({
  groups,
  options = {},
  readLocal,
  readFull,
}: ResolveBlocklistInput<Row>): Promise<Map<string, Row>> {
  const requiresAuthoritativeRead =
    options.client !== undefined || options.query !== undefined || options.readOnly === false
  if (requiresAuthoritativeRead || !isUrlBlocklistBloomFilterEnabled()) return readFull(groups)

  const uniqueCandidates = [...new Set(groups.flatMap(group => group.candidates))]
  const [bloomResults, localRows] = await Promise.all([
    checkBloomFilters(uniqueCandidates),
    readLocal(groups),
  ])
  const bloomByCandidate = new Map(
    uniqueCandidates.map((candidate, index) => [candidate, bloomResults[index]]),
  )
  const needDomainRead = groups.filter(
    group =>
      localRows.get(group.key)?.is_blocked !== true &&
      group.candidates.some(candidate => bloomByCandidate.get(candidate) !== false),
  )
  if (needDomainRead.length === 0) return localRows

  const blockedKeys = await getBlocklistedDomainKeys(needDomainRead, options)
  const resolved = new Map(localRows)
  for (const key of blockedKeys) {
    const row = localRows.get(key)
    if (row) resolved.set(key, { ...row, is_blocked: true })
  }
  return resolved
}
