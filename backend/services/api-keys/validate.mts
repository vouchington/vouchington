import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { hashApiKey } from './generate.mts'
import { validateApiKeyChecksum } from './checksum.mts'
import { checkApiKeyBloomFilter } from './bloom-filter.mts'
import { getApiKeyByHash } from './get.mts'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import type { ApiKey } from './types.mts'

export async function validateApiKey(
  rawKey: string,
  requiredPermission: string,
): Promise<{ valid: boolean; apiKey?: ApiKey }> {
  // Step 1: structural parse + HMAC checksum verify — no I/O
  if (!validateApiKeyChecksum(rawKey)) return { valid: false }

  const keyHash = hashApiKey(rawKey)

  // Step 2: Bloom filter probe
  const { apiKeyBloomFilterEnabled } = bloomFilterConfig.getFields()
  if (apiKeyBloomFilterEnabled) {
    const bloomFilterResult = await checkApiKeyBloomFilter(keyHash)
    if (bloomFilterResult === false) return { valid: false }
  }

  // Step 3: DB lookup
  const apiKey = await getApiKeyByHash(keyHash)

  if (!apiKey) return { valid: false }

  // Step 4: Permission check
  if (!apiKey.permissions.includes(requiredPermission)) return { valid: false }

  // Step 5: Fire-and-forget update last_used_at
  write(sql`/* validateApiKey */
    UPDATE api_keys
    SET last_used_at = NOW()
    WHERE key_hash = ${keyHash}
      AND revoked_at IS NULL
  `).catch((err: unknown) => {
    onError(err instanceof Error ? err : new Error(String(err)))
  })

  return { valid: true, apiKey }
}
