import type { QueryOptions, TransactionQuery } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { normalizeHostname } from '@ts-shared/utils/urls'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { prepareUrlHostnamesForOwnedMutation } from '@services/urls-hostnames/upsert'
import assert from 'http-assert'

/** Returns a UUID unchanged, upserts a hostname string, or preserves null. */
export async function resolveHostname(
  userId: string,
  hostname: string | null,
  options: QueryOptions = {},
): Promise<string | null> {
  const normalized = normalizeHostnameInput(hostname)
  if (normalized === null || isUUID(normalized)) return normalized
  const hostnameMap = await upsertUrlHostnames(userId, [normalized], options)
  return hostnameMap.values().next().value ?? null
}

/** Resolve an owned hostname before locking it; the caller must introduce it publicly. */
export async function prepareHostnameForOwnedMutation(
  userId: string,
  hostname: string | null,
  query: TransactionQuery,
): Promise<string | null> {
  const normalized = normalizeHostnameInput(hostname)
  if (normalized === null || isUUID(normalized)) return normalized
  const hostnameMap = await prepareUrlHostnamesForOwnedMutation(userId, [normalized], query)
  return hostnameMap.values().next().value ?? null
}

function normalizeHostnameInput(hostname: string | null): string | null {
  assert(
    hostname === null || typeof hostname === 'string',
    422,
    'hostname must be a string or null',
  )
  if (hostname === null) return null
  if (isUUID(hostname)) return hostname
  const normalized = normalizeHostname(hostname)
  assert(normalized !== null, 422, 'Invalid hostname format')
  return normalized
}
