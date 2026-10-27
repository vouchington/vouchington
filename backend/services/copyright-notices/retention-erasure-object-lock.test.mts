import { beginTestCopyrightStorageObjectOwnershipRace } from '@voucha/test-helpers/copyright-email-intake-retention'
import { readCopyrightRetentionMarker } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { describe, expect, it, vi } from 'vitest'

describe('copyright storage-object ownership locks', () => {
  it('preserves a new evidence owner committed while eligible erasure waits for the object lock', async () => {
    const now = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000)
    const retentionDays = 30
    let race: Awaited<ReturnType<typeof beginTestCopyrightStorageObjectOwnershipRace>> | undefined
    try {
      vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', '')
      race = await beginTestCopyrightStorageObjectOwnershipRace({
        now,
        cutoff: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000),
        retentionDays,
      })
      await race.lockWait
      await race.commitWriter()
      await expect(race.erasure).resolves.toBe('erased')
      await expect(readCopyrightRetentionMarker(race.firstNoticeId)).resolves.toEqual({
        retention_days: retentionDays,
        erased_object_count: 0,
      })
      const retained = await getCopyrightNoticePrivateAggregate(race.secondNoticeId)
      expect(retained?.evidenceArtifacts).toEqual([
        expect.objectContaining({ storage_object_id: race.storageObjectId }),
      ])
    } finally {
      try {
        await race?.close()
      } finally {
        vi.unstubAllEnvs()
      }
    }
  })
})
