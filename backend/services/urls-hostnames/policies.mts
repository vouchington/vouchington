import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type HostnamePolicy = {
  is_blocked: boolean
  should_skip_web_risk: boolean
}

/** One subject of a batched policy read and the lookup keys that can match it. */
export type CandidateGroup = { key: string; candidates: string[] }

export const EMPTY_HOSTNAME_POLICY: Readonly<HostnamePolicy> = {
  is_blocked: false,
  should_skip_web_risk: false,
}

export function normalizeHostnameForPolicy(hostname: string): string {
  return hostname.toLowerCase().trim()
}

export function getHostnamePolicyCandidates(hostname: string): string[] {
  const labels = normalizeHostnameForPolicy(hostname).split('.').filter(Boolean)
  const candidates: string[] = []
  for (let index = 0; index < labels.length; index++) {
    candidates.push(labels.slice(index).join('.'))
  }
  return candidates
}

/** Every hostname with each of its suffixes, keyed by normalized hostname. */
export function getHostnamePolicyGroups(hostnames: string[]): CandidateGroup[] {
  return [...new Set(hostnames.map(normalizeHostnameForPolicy))].map(key => ({
    key,
    candidates: getHostnamePolicyCandidates(key),
  }))
}

/** Parallel arrays for `unnest($1::text[], $2::text[])`: one row per (group, candidate). */
export function flattenCandidateGroups(groups: CandidateGroup[]): {
  keys: string[]
  candidates: string[]
} {
  const keys: string[] = []
  const candidates: string[] = []
  for (const group of groups) {
    for (const candidate of group.candidates) {
      keys.push(group.key)
      candidates.push(candidate)
    }
  }
  return { keys, candidates }
}

type PolicyRow = { hostname: string } & Partial<HostnamePolicy>

function policiesFromRows(
  groups: CandidateGroup[],
  rows: PolicyRow[],
): Map<string, HostnamePolicy> {
  const byHostname = new Map(rows.map(row => [row.hostname, row]))
  return new Map(
    groups.map(({ key }) => {
      const row = byHostname.get(key)
      return [
        key,
        {
          is_blocked: row?.is_blocked === true,
          should_skip_web_risk: row?.should_skip_web_risk === true,
        },
      ]
    }),
  )
}

/** `url_hostnames` flags only: no `blocklisted_domains`. One query for all groups. */
export async function getLocalHostnamePolicies(
  groups: CandidateGroup[],
  options: QueryOptions = {},
): Promise<Map<string, HostnamePolicy>> {
  const { keys, candidates } = flattenCandidateGroups(groups)
  if (candidates.length === 0) return policiesFromRows(groups, [])

  const { rows } = await read(
    sql`/* getLocalHostnamePolicies */
    SELECT
      p.hostname,
      COALESCE(bool_or(uh.is_blocked), FALSE) AS is_blocked,
      COALESCE(bool_or(uh.should_skip_web_risk), FALSE) AS should_skip_web_risk
    FROM unnest(${keys}::text[], ${candidates}::text[]) AS p(hostname, candidate)
    LEFT JOIN url_hostnames uh ON uh.hostname = p.candidate
    GROUP BY p.hostname
  `,
    options,
  )
  return policiesFromRows(groups, rows as PolicyRow[])
}

/** `url_hostnames` flags plus `blocklisted_domains` for every group in one query. */
export async function getFullHostnamePolicies(
  groups: CandidateGroup[],
  options: QueryOptions = {},
): Promise<Map<string, HostnamePolicy>> {
  const { keys, candidates } = flattenCandidateGroups(groups)
  if (candidates.length === 0) return policiesFromRows(groups, [])

  const { rows } = await read(
    sql`/* getFullHostnamePolicies */
    WITH pairs AS (
      SELECT * FROM unnest(${keys}::text[], ${candidates}::text[]) AS p(hostname, candidate)
    ),
    url_policy AS (
      SELECT
        pairs.hostname,
        COALESCE(bool_or(uh.is_blocked), FALSE) AS is_blocked,
        COALESCE(bool_or(uh.should_skip_web_risk), FALSE) AS should_skip_web_risk
      FROM pairs
      LEFT JOIN url_hostnames uh ON uh.hostname = pairs.candidate
      GROUP BY pairs.hostname
    )
    SELECT
      url_policy.hostname,
      url_policy.is_blocked OR EXISTS (
        SELECT 1
        FROM pairs
        INNER JOIN blocklisted_domains db ON db.domain = pairs.candidate
        INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
        WHERE pairs.hostname = url_policy.hostname
          AND dbs.type = 'url'::domain_blocklist_types
      ) AS is_blocked,
      url_policy.should_skip_web_risk
    FROM url_policy
  `,
    options,
  )
  return policiesFromRows(groups, rows as PolicyRow[])
}

/** Keys of the groups with at least one candidate in a URL-type `blocklisted_domains` row. */
export async function getBlocklistedDomainKeys(
  groups: CandidateGroup[],
  options: QueryOptions = {},
): Promise<Set<string>> {
  const { keys, candidates } = flattenCandidateGroups(groups)
  if (candidates.length === 0) return new Set()

  const { rows } = await read(
    sql`/* getBlocklistedDomainKeys */
    SELECT DISTINCT p.hostname
    FROM unnest(${keys}::text[], ${candidates}::text[]) AS p(hostname, candidate)
    INNER JOIN blocklisted_domains db ON db.domain = p.candidate
    INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
    WHERE dbs.type = 'url'::domain_blocklist_types
  `,
    options,
  )
  return new Set((rows as Array<{ hostname: string }>).map(row => row.hostname))
}

export async function getLocalHostnamePolicy(
  hostname: string,
  options: QueryOptions = {},
): Promise<HostnamePolicy> {
  const groups = getHostnamePolicyGroups([hostname])
  const policies = await getLocalHostnamePolicies(groups, options)
  return policies.get(groups[0]!.key) ?? EMPTY_HOSTNAME_POLICY
}
