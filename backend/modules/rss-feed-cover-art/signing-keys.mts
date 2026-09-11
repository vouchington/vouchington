import { parseSigningKeys, SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'

let cachedSigningKeys: string[] | undefined

export function getSigningKeys(): string[] {
  if (process.env.NODE_ENV === 'test') {
    return parseSigningKeys(process.env[SIDELOAD_SIGNING_KEYS_ENV])
  }
  if (cachedSigningKeys !== undefined) return cachedSigningKeys
  const keys = parseSigningKeys(process.env[SIDELOAD_SIGNING_KEYS_ENV])
  cachedSigningKeys = keys
  return keys
}
