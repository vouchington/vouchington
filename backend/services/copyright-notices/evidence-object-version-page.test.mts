import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installS3TestCredentials } from '@voucha/test-helpers/s3-test-environment'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { deleteCopyrightEvidenceObjectVersionPage } from './evidence-object-version-page.mts'

const KEY = 'copyright-inbound/versions.pdf'
const PAGE = 100

describe('copyright evidence object version pages', () => {
  let restoreS3Credentials: (() => void) | undefined
  beforeEach(() => {
    restoreS3Credentials = installS3TestCredentials()
  })
  afterEach(() => {
    restoreS3Credentials?.()
  })
  const bucket = useFakeCopyrightEvidenceBucket({ pageSize: 1_000 })

  it('deletes one 100-version page per call until every version and marker is gone', async () => {
    bucket.put(KEY, { versions: 249, deleteMarker: true })
    expect(bucket.countVersions(KEY)).toBe(250)

    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toEqual({
      hasMore: true,
      scanned: PAGE,
    })
    expect(bucket.countVersions(KEY)).toBe(150)
    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toEqual({
      hasMore: true,
      scanned: PAGE,
    })
    expect(bucket.countVersions(KEY)).toBe(50)
    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toEqual({
      hasMore: false,
      scanned: 50,
    })
    expect(bucket.countVersions(KEY)).toBe(0)
    expect(bucket.deleteRequests()).toBe(3)
  })

  it('fails the page and keeps every version when DeleteObjects answers with Errors', async () => {
    bucket.put(KEY, { versions: 120 })
    bucket.refuse(KEY)

    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).rejects.toThrow(
      'Copyright evidence delete refused 100 object versions',
    )
    expect(bucket.countVersions(KEY)).toBe(120)

    bucket.allow(KEY)
    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toMatchObject({
      hasMore: true,
    })
    expect(bucket.countVersions(KEY)).toBe(20)
  })
})
