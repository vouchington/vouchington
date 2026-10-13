import type { QueryOptions } from '@data-stores/psql/types'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'

/** Resolve an address's domain once, where the address enters persistent storage. */
export async function resolveEmailDomainHostnameId(
  emailAddress: string | null,
  options: QueryOptions = {},
): Promise<string | null> {
  const separator = emailAddress?.lastIndexOf('@') ?? -1
  const domain = separator >= 0 ? emailAddress?.slice(separator + 1).toLowerCase() : null
  if (!domain) return null
  const hostnames = await upsertUrlHostnames(null, [domain], options, 'private_email')
  const id = hostnames.values().next().value
  if (!id) throw new Error('Email domain hostname upsert returned no ID')
  return id
}
