import { read, write } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { vi } from 'vitest'

export function failNextHostnameCacheDeleteForTest(hostnameId: string): () => void {
  const original = ValkeyCache.deleteFromCaches
  let failed = false
  const spy = vi.spyOn(ValkeyCache, 'deleteFromCaches').mockImplementation(async groups => {
    if (!failed && groups.some(group => group.keys.includes(hostnameId))) {
      failed = true
      throw new Error('owned cache eviction failure')
    }
    return original.call(ValkeyCache, groups)
  })
  return () => spy.mockRestore()
}

export type HostnameCacheInvalidationWorkForTest = {
  url_hostname_id: string
  generation: string
  lease_token: string | null
  attempt_count: number
  available_at: Date
  enqueued_at: Date
}

export async function getHostnameCacheInvalidationWorkForTest(
  hostnameId: string,
): Promise<HostnameCacheInvalidationWorkForTest | null> {
  const { rows } = await read<HostnameCacheInvalidationWorkForTest>(
    `/* getHostnameCacheInvalidationWorkForTest */
    SELECT url_hostname_id, generation::text, lease_token, attempt_count,
      available_at, enqueued_at
    FROM url_hostname_cache_invalidation_work_items WHERE url_hostname_id = $1::uuid`,
    [hostnameId],
  )
  return rows[0] ?? null
}

export async function ageHostnameCacheInvalidationWorkForTest(
  hostnameId: string,
  seconds: number,
): Promise<void> {
  await write(
    `/* ageHostnameCacheInvalidationWorkForTest */
    UPDATE url_hostname_cache_invalidation_work_items
    SET enqueued_at = CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 second')
    WHERE url_hostname_id = $1::uuid`,
    [hostnameId, seconds],
  )
}

export async function expireHostnameCacheInvalidationLeaseForTest(
  hostnameId: string,
): Promise<void> {
  await write(
    `/* expireHostnameCacheInvalidationLeaseForTest */
    UPDATE url_hostname_cache_invalidation_work_items
    SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE url_hostname_id = $1::uuid`,
    [hostnameId],
  )
}

export async function makeHostnameCacheInvalidationAvailableForTest(
  hostnameId: string,
): Promise<void> {
  await write(
    `/* makeHostnameCacheInvalidationAvailableForTest */
    UPDATE url_hostname_cache_invalidation_work_items
    SET available_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE url_hostname_id = $1::uuid`,
    [hostnameId],
  )
}
