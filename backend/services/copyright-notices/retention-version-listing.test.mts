import { describe, expect, it } from 'vitest'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { deleteCopyrightEvidenceObjectVersionPage } from './retention-erasure-s3.mts'

describe('copyright evidence version identity validation', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  it.each([
    ['truncated_empty', 'omitted its truncated head'],
    ['over_cap', 'exceeded its requested cap'],
    ['foreign_key', 'returned an invalid identity'],
    ['missing_version', 'returned an invalid identity'],
  ] as const)(
    'retains every evidence version after a %s provider listing',
    async (fault, message) => {
      const key = `copyright-inbound/${crypto.randomUUID()}.pdf`
      bucket.put(key, { versions: 2, deleteMarker: true })
      bucket.malformedNextListing(fault)

      await expect(deleteCopyrightEvidenceObjectVersionPage(key, 2)).rejects.toThrow(message)
      expect(bucket.deleteRequests()).toBe(0)
      expect(bucket.countVersions(key)).toBe(3)
    },
  )

  it.each([0, 1.5, 1001])(
    'rejects invalid physical deletion page size %s before storage',
    async pageSize => {
      const key = `copyright-inbound/${crypto.randomUUID()}.pdf`
      bucket.put(key)
      await expect(deleteCopyrightEvidenceObjectVersionPage(key, pageSize)).rejects.toThrow(
        'Invalid copyright S3 version page cap',
      )
      expect(bucket.deleteRequests()).toBe(0)
      expect(bucket.countVersions(key)).toBe(1)
    },
  )
})
