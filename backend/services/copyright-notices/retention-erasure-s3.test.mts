import { describe, expect, it, vi } from 'vitest'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'

const WORK_PAGE_CAP = 128
const EIGHT_YEARS_MS = 8 * 366 * 24 * 60 * 60 * 1000

describe('copyright evidence retention and the evidence bucket', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  async function makeRetentionEligible() {
    await setClock(new Date(Date.now() + EIGHT_YEARS_MS))
  }

  async function finishCase(noticeId: string) {
    return advanceCopyrightRetentionWorkPages(noticeId, WORK_PAGE_CAP)
  }

  async function createStoredCase(artifacts: number, sharedKey?: string) {
    const entry = await createRetentionMinimalCase({ artifacts, sharedKey })
    for (const key of entry.evidenceKeys) bucket.put(key, { versions: 2, deleteMarker: true })
    return entry
  }

  it('preserves a refused case, lets a healthy case finish, then resumes the refused case', async () => {
    const refusedCase = await createStoredCase(2)
    const healthyCase = await createStoredCase(1)
    const refusedKey = refusedCase.evidenceKeys[1]!
    bucket.refuse(refusedKey)
    const before = await readCopyrightRetentionColumns(refusedCase.noticeId)
    await makeRetentionEligible()

    // A provider refusal aborts the current work page. The staged continuation remains resumable.
    await expect(finishCase(refusedCase.noticeId)).rejects.toThrow(
      'Copyright evidence object version deletion was refused',
    )

    expect(bucket.countVersions(refusedKey)).toBe(3)
    await expect(readCopyrightRetentionColumns(refusedCase.noticeId)).resolves.toEqual(before)
    await expect(readCopyrightRetentionMarker(refusedCase.noticeId)).resolves.toBeNull()

    const healthyPages = await finishCase(healthyCase.noticeId)
    expect(healthyPages).toContain('erased')
    expect(bucket.countVersions(healthyCase.evidenceKeys[0]!)).toBe(0)
    await expect(readCopyrightRetentionMarker(healthyCase.noticeId)).resolves.toMatchObject({
      erased_object_count: 1,
    })

    bucket.allow(refusedKey)
    const resumedPages = await finishCase(refusedCase.noticeId)
    expect(resumedPages).toContain('erased')
    for (const key of refusedCase.evidenceKeys) expect(bucket.countVersions(key)).toBe(0)
    await expect(readCopyrightRetentionColumns(refusedCase.noticeId)).resolves.not.toEqual(before)
    await expect(readCopyrightRetentionMarker(refusedCase.noticeId)).resolves.toMatchObject({
      erased_object_count: 2,
    })
    const repeatedPages = await finishCase(refusedCase.noticeId)
    expect(repeatedPages).not.toContain('erased')
    expect(bucket.countVersions(refusedKey)).toBe(0)
  })

  it('fails closed without an evidence bucket, even when the case has no raw evidence object', async () => {
    const entry = await createRetentionMinimalCase()
    const before = await readCopyrightRetentionColumns(entry.noticeId)
    await makeRetentionEligible()
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', '')

    await expect(finishCase(entry.noticeId)).rejects.toThrow(
      'S3_BUCKET_COPYRIGHT_EVIDENCE is required',
    )

    expect(bucket.deleteRequests()).toBe(0)
    await expect(readCopyrightRetentionColumns(entry.noticeId)).resolves.toEqual(before)
    await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.toBeNull()
  })

  it('keeps shared bytes until the final case reference is erased', async () => {
    const first = await createStoredCase(1)
    const sharedKey = first.evidenceKeys[0]!
    const second = await createRetentionMinimalCase({ artifacts: 1, sharedKey })
    await makeRetentionEligible()

    const firstPages = await finishCase(first.noticeId)
    expect(firstPages).toContain('erased')
    expect(bucket.countVersions(sharedKey)).toBe(3)
    await expect(readCopyrightRetentionMarker(first.noticeId)).resolves.toMatchObject({
      erased_object_count: 0,
    })

    const secondPages = await finishCase(second.noticeId)
    expect(secondPages).toContain('erased')
    expect(bucket.countVersions(sharedKey)).toBe(0)
    await expect(readCopyrightRetentionMarker(second.noticeId)).resolves.toMatchObject({
      erased_object_count: 1,
    })
  })

  it('deletes only the exact key, never another object that merely shares its prefix', async () => {
    const entry = await createStoredCase(1)
    const evidenceKey = entry.evidenceKeys[0]!
    const neighbour = `${evidenceKey}.copy`
    bucket.put(neighbour, { versions: 2 })
    await makeRetentionEligible()

    const pages = await finishCase(entry.noticeId)
    expect(pages).toContain('erased')

    expect(bucket.countVersions(evidenceKey)).toBe(0)
    expect(bucket.countVersions(neighbour)).toBe(2)
  })
})
