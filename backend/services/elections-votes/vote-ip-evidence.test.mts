import { describe, expect, it } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getVoteIpEvidence, storeVoteIpEvidence, voteIpEvidenceKey } from './vote-ip-evidence.mts'

const HOUR_MS = 60 * 60_000

describe('vote IP evidence', () => {
  it('keeps the first IP and its original expiry on a replayed ballot', async () => {
    const nowMs = Date.now()
    const voteId = getMinUUIDv7ForDate(new Date(nowMs - HOUR_MS))
    const key = voteIpEvidenceKey(voteId)
    try {
      await storeVoteIpEvidence(voteId, '203.0.113.41', new Date(nowMs))
      const initialTtl = await cacheValkeyClient.ttl(key)
      expect(initialTtl).toBeGreaterThan(0)
      expect(initialTtl).toBeLessThanOrEqual(60 * 60)

      await storeVoteIpEvidence(voteId, '203.0.113.42', new Date(nowMs + 30 * 60_000))
      expect(await getVoteIpEvidence(voteId)).toBe('203.0.113.41')
      expect(await cacheValkeyClient.ttl(key)).toBeLessThanOrEqual(initialTtl)
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })

  it('does not recreate raw evidence for a ballot older than two hours', async () => {
    const voteId = getMinUUIDv7ForDate(new Date(Date.now() - 2 * HOUR_MS - 1_000))
    const key = voteIpEvidenceKey(voteId)
    try {
      await storeVoteIpEvidence(voteId, '203.0.113.43')
      expect(await getVoteIpEvidence(voteId)).toBeNull()
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })
})
