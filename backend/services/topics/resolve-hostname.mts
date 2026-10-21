import type { QueryOptions } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { normalizeHostname } from '@ts-shared/utils/urls'
import { upsertUrlHostnames, type HostnameProvenance } from '@services/urls-hostnames'
import assert from 'http-assert'

/** Returns a UUID unchanged, upserts a hostname string, or preserves null. */
export async function resolveHostname(
  userId: string,
  hostname: string | null,
  options: QueryOptions = {},
  provenance: HostnameProvenance = 'public',
): Promise<string | null> {
  assert(
    hostname === null || typeof hostname === 'string',
    422,
    'hostname must be a string or null',
  )
  if (hostname === null) return null
  if (isUUID(hostname)) return hostname
  const normalized = normalizeHostname(hostname)
  assert(normalized !== null, 422, 'Invalid hostname format')
  const hostnameMap = await upsertUrlHostnames(userId, [normalized!], options, provenance)
  return hostnameMap.values().next().value ?? null
}
