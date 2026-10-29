import { beginTestCopyrightStorageObjectOwnershipRace } from '@voucha/test-helpers/copyright-email-intake-retention'
import { beginTransaction } from '@voucha/test-helpers'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import { describe, expect, it } from 'vitest'

describe('copyright storage-object ownership locks', () => {
  it.each(['insertConcurrentCopyrightEvidenceOwner', 'getTestPostgresBackendProcessId'])(
    'reports a %s setup failure before native lock observation starts',
    async queryMarker => {
      await expect(
        beginTestCopyrightStorageObjectOwnershipRace(async () =>
          rejectQuery(
            await beginTransaction(),
            statement => statement.includes(queryMarker),
            'Owned copyright evidence setup failed',
          ),
        ),
      ).rejects.toThrow('Owned copyright evidence setup failed')
    },
  )
  it('rechecks cross-case references after waiting on the object registry lock', async () => {
    const race = await beginTestCopyrightStorageObjectOwnershipRace()
    try {
      await race.lockWait
      await race.commitWriter()
      await race.erasure
      await race.commitEraser()
      await expect(race.readObjectState()).resolves.toEqual({ erasedAt: null, referenceCount: 2 })
    } finally {
      await race.close()
    }
  })
})
