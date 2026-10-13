import type { QueryOptions } from '@data-stores/psql/types'
import { normalizeUrlHostname, upsertUrlHostnames } from '@services/urls-hostnames/upsert'

function emailDomain(emailAddress: string | null): string | null {
  const separator = emailAddress?.lastIndexOf('@') ?? -1
  const domain = separator >= 0 ? emailAddress?.slice(separator + 1).toLowerCase() : null
  return domain || null
}

/** Resolve an address batch with one hostname upsert on the owning transaction. */
export async function resolveEmailDomainHostnameIds(
  emailAddresses: readonly (string | null)[],
  options: QueryOptions = {},
): Promise<(string | null)[]> {
  const domains = emailAddresses.map(emailDomain)
  const hostnames = await upsertUrlHostnames(
    null,
    domains.filter((domain): domain is string => domain !== null),
    options,
    'private_email',
  )
  return domains.map(domain => {
    if (domain === null) return null
    const id = hostnames.get(normalizeUrlHostname(domain))
    if (!id) throw new Error('Email domain hostname upsert returned no ID')
    return id
  })
}

/** Resolve an address's domain once, where the address enters persistent storage. */
export async function resolveEmailDomainHostnameId(
  emailAddress: string | null,
  options: QueryOptions = {},
): Promise<string | null> {
  return (await resolveEmailDomainHostnameIds([emailAddress], options))[0] ?? null
}
