import { beginTestCopyrightStorageObjectOwnershipRace } from '@voucha/test-helpers/copyright-email-intake-retention'
import { describe, expect, it } from 'vitest'

describe('copyright storage-object ownership locks', () => {
  it('sees a new owner after waiting on the object row before returning a key for S3 deletion', async () => {
    const race = await beginTestCopyrightStorageObjectOwnershipRace()
    try {
      await race.lockIssued
      await race.commitWriter()
      expect(await race.listing).toEqual([])
      await race.commitEraser()
    } finally {
      await race.close()
    }
  })
})
