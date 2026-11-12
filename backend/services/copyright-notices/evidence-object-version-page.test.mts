import { describe, expect, it } from 'vitest'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { deleteCopyrightEvidenceObjectVersionPage } from './evidence-object-version-page.mts'

const KEY = 'copyright-inbound/versions.pdf'
const PAGE = 100

describe('copyright evidence object version pages', () => {
  const bucket = useCopyrightEvidenceBucket()

  it('deletes one 100-version page per call until every version and marker is gone', async () => {
    const siblingKey = `${KEY}.sibling`
    await bucket.put(KEY, { versions: 249, deleteMarker: true })
    await bucket.put(siblingKey, { versions: 2 })
    expect(await bucket.countVersions(KEY)).toBe(250)

    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toEqual({
      hasMore: true,
      scanned: PAGE,
    })
    expect(await bucket.countVersions(KEY)).toBe(150)
    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toEqual({
      hasMore: true,
      scanned: PAGE,
    })
    expect(await bucket.countVersions(KEY)).toBe(50)
    // The last page also lists the sibling's two versions, which count as scanned work.
    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toEqual({
      hasMore: false,
      scanned: 52,
    })
    expect(await bucket.countVersions(KEY)).toBe(0)
    // The exact-key sweep never reaches a longer key that shares its prefix.
    expect(await bucket.countVersions(siblingKey)).toBe(2)
  })

  it('fails the page and keeps every version when DeleteObjects answers with Errors', async () => {
    await bucket.put(KEY, { versions: 120 })
    await bucket.refuse(KEY)

    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).rejects.toThrow(
      'Copyright evidence delete refused 100 object versions',
    )
    expect(await bucket.countVersions(KEY)).toBe(120)

    await bucket.allow(KEY)
    await expect(deleteCopyrightEvidenceObjectVersionPage(KEY, PAGE)).resolves.toMatchObject({
      hasMore: true,
    })
    expect(await bucket.countVersions(KEY)).toBe(20)
  })
})
