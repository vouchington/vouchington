import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type HostnamePolicy = {
  blocked: boolean
  skip_web_risk: boolean
}

export function getHostnamePolicyCandidates(hostname: string): string[] {
  const normalized = hostname.toLowerCase().trim()
  const labels = normalized.split('.').filter(Boolean)
  const candidates: string[] = []
  for (let index = 0; index < labels.length; index++) {
    candidates.push(labels.slice(index).join('.'))
  }
  return candidates
}

export async function getHostnamePolicy(
  hostname: string,
  options: QueryOptions = {},
): Promise<HostnamePolicy> {
  const candidates = getHostnamePolicyCandidates(hostname)
  if (candidates.length === 0) return { blocked: false, skip_web_risk: false }

  const { rows } = await read(
    sql`/* getHostnamePolicy */
    SELECT
      EXISTS (
        SELECT 1
        FROM url_hostnames
        WHERE hostname = ANY(${candidates}::text[])
          AND blocked = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM domain_blacklists db
        INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
        WHERE db.domain = ANY(${candidates}::text[])
          AND dbs.type = 'url'::domain_blacklist_types
      ) AS blocked,
      EXISTS (
        SELECT 1
        FROM url_hostnames
        WHERE hostname = ANY(${candidates}::text[])
          AND skip_web_risk = TRUE
      ) AS skip_web_risk
  `,
    options,
  )

  const row = rows[0] as Partial<HostnamePolicy> | undefined
  return {
    blocked: row?.blocked === true,
    skip_web_risk: row?.skip_web_risk === true,
  }
}

export async function getLocalHostnamePolicy(
  hostname: string,
  options: QueryOptions = {},
): Promise<HostnamePolicy> {
  const candidates = getHostnamePolicyCandidates(hostname)
  if (candidates.length === 0) return { blocked: false, skip_web_risk: false }

  const { rows } = await read(
    sql`/* getLocalHostnamePolicy */
    SELECT
      EXISTS (
        SELECT 1
        FROM url_hostnames
        WHERE hostname = ANY(${candidates}::text[])
          AND blocked = TRUE
      ) AS blocked,
      EXISTS (
        SELECT 1
        FROM url_hostnames
        WHERE hostname = ANY(${candidates}::text[])
          AND skip_web_risk = TRUE
      ) AS skip_web_risk
  `,
    options,
  )

  const row = rows[0] as Partial<HostnamePolicy> | undefined
  return {
    blocked: row?.blocked === true,
    skip_web_risk: row?.skip_web_risk === true,
  }
}
