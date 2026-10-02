import { describe, expect, it, vi } from 'vitest'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { sweepCopyrightEvidenceRetention } from './index.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const afterRetention = () => new Date(Date.now() + 400 * DAY_MS)

describe('copyright evidence retention and the evidence bucket', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()

  async function createStoredCase(artifacts: number, sharedKey?: string) {
    const entry = await createRetentionMinimalCase({ artifacts, sharedKey })
    for (const key of entry.evidenceKeys) bucket.put(key, { versions: 2, deleteMarker: true })
    return entry
  }

  it('leaves a case whose bucket delete is refused exactly as it was, and finishes it on retry', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const refusedCase = await createStoredCase(2)
    const healthyCase = await createStoredCase(1)
    const [, refusedKey] = refusedCase.evidenceKeys
    bucket.refuse(refusedKey!)
    const noticeIds = [refusedCase.noticeId, healthyCase.noticeId]
    const before = await readCopyrightRetentionColumns(refusedCase.noticeId)

    // The bucket answers 200 with an Errors entry, which is a refusal, not a success.
    await expect(
      sweepCopyrightEvidenceRetention({ now: afterRetention(), noticeIds }),
    ).resolves.toEqual({
      erased: 1,
      ineligible: 0,
      failed: [{ noticeId: refusedCase.noticeId, reason: 'Error' }],
    })

    expect(bucket.countVersions(refusedKey!)).toBe(3)
    await expect(readCopyrightRetentionColumns(refusedCase.noticeId)).resolves.toEqual(before)
    await expect(readCopyrightRetentionMarker(refusedCase.noticeId)).resolves.toBeNull()
    expect(bucket.countVersions(healthyCase.evidenceKeys[0]!)).toBe(0)
    await expect(readCopyrightRetentionMarker(healthyCase.noticeId)).resolves.not.toBeNull()

    bucket.allow(refusedKey!)
    await expect(
      sweepCopyrightEvidenceRetention({ now: afterRetention(), noticeIds }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })

    for (const key of refusedCase.evidenceKeys) expect(bucket.countVersions(key)).toBe(0)
    await expect(readCopyrightRetentionColumns(refusedCase.noticeId)).resolves.not.toEqual(before)
    await expect(readCopyrightRetentionMarker(refusedCase.noticeId)).resolves.toEqual({
      retention_days: 30,
      erased_object_count: 2,
    })
    await expect(
      sweepCopyrightEvidenceRetention({ now: afterRetention(), noticeIds }),
    ).resolves.toEqual({ erased: 0, ineligible: 0, failed: [] })
  })

  it('fails closed without an evidence bucket configured: no request, no database change', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createStoredCase(1)
    const before = await readCopyrightRetentionColumns(entry.noticeId)
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', '')

    await expect(
      sweepCopyrightEvidenceRetention({ now: afterRetention(), noticeIds: [entry.noticeId] }),
    ).resolves.toEqual({
      erased: 0,
      ineligible: 0,
      failed: [{ noticeId: entry.noticeId, reason: 'Error' }],
    })

    expect(bucket.deleteRequests()).toBe(0)
    expect(bucket.countVersions(entry.evidenceKeys[0]!)).toBe(3)
    await expect(readCopyrightRetentionColumns(entry.noticeId)).resolves.toEqual(before)
    await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.toBeNull()
  })

  it('erases a case that stored no original without any bucket request', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createRetentionMinimalCase()
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', '')

    await expect(
      sweepCopyrightEvidenceRetention({ now: afterRetention(), noticeIds: [entry.noticeId] }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })

    expect(bucket.deleteRequests()).toBe(0)
    await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.toEqual({
      retention_days: 30,
      erased_object_count: 0,
    })
  })

  it('keeps an object another case still references until the last case is erased', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const first = await createStoredCase(1)
    const sharedKey = first.evidenceKeys[0]!
    const second = await createRetentionMinimalCase({ artifacts: 1, sharedKey })
    const now = afterRetention()

    await expect(
      sweepCopyrightEvidenceRetention({ now, noticeIds: [first.noticeId] }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
    expect(bucket.countVersions(sharedKey)).toBe(3)
    await expect(readCopyrightRetentionMarker(first.noticeId)).resolves.toMatchObject({
      erased_object_count: 0,
    })

    await expect(
      sweepCopyrightEvidenceRetention({ now, noticeIds: [second.noticeId] }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
    expect(bucket.countVersions(sharedKey)).toBe(0)
    await expect(readCopyrightRetentionMarker(second.noticeId)).resolves.toMatchObject({
      erased_object_count: 1,
    })
  })

  it('deletes only the exact key, never another object that merely shares its prefix', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createStoredCase(1)
    const neighbour = `${entry.evidenceKeys[0]}.copy`
    bucket.put(neighbour, { versions: 2 })

    await expect(
      sweepCopyrightEvidenceRetention({ now: afterRetention(), noticeIds: [entry.noticeId] }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })

    expect(bucket.countVersions(entry.evidenceKeys[0]!)).toBe(0)
    expect(bucket.countVersions(neighbour)).toBe(2)
  })
})
