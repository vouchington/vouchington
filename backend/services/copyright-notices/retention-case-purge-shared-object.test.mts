import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CopyrightCasePurgeJobData } from '@queues/psql/types'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import {
  addRetentionArtifact,
  createRetentionMinimalCase,
} from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  publishCopyrightCasePurgeCoverage,
  readCopyrightCasePurgeFixture,
  readCopyrightCasePurgeFixtureObject,
  settleCopyrightCasePurgeFixtureActions,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const PURGE_NOW = new Date('2100-01-01T12:00:00.000Z')

function firstPage(noticeId: string): CopyrightCasePurgeJobData {
  return {
    noticeId,
    phase: 'parties',
    phaseIndex: 0,
    afterId: null,
    legalClockAt: null,
    proofVersion: null,
  }
}

async function finishCase(data: CopyrightCasePurgeJobData): Promise<void> {
  let current = data
  for (let page = 0; page < 1_000; page += 1) {
    const result = await runCopyrightCasePurgePage(current, PURGE_NOW)
    if (!result.hasMore) {
      const state = await readCopyrightCasePurgeFixture(current.noticeId)
      if (state.live || state.retained)
        throw new Error(`Copyright case purge stopped before deletion at ${current.phase}`)
      return
    }
    current = result.data
  }
  throw new Error(`Copyright case purge exceeded 1000 pages at ${current.phase}`)
}

async function assertSharedObjectDeleted(key: string, count: number): Promise<void> {
  expect(count).toBe(0)
  expect(await readCopyrightCasePurgeFixtureObject(key)).toBeNull()
}

function assertClaimPrecedesDelete(count: number): void {
  expect(count).toBe(4)
}

async function assertKeyReused(key: string): Promise<void> {
  const freshCase = await createRetentionMinimalCase()
  await addRetentionArtifact(freshCase.submissionId, key)
  expect(await readCopyrightCasePurgeFixtureObject(key)).toMatchObject({ claimed: false })
}

describe('copyright case purge shared evidence ownership', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useFakeCopyrightEvidenceBucket()
  const configureRetention = useCopyrightRetentionConfig()
  const setPageSize = useCopyrightCasePurgePageSize()

  // no-mistakes-timeout-reason: two reviewed email cases and their bounded PostgreSQL and S3 pages
  it('keeps a shared object for its other owner, then resumes a claimed deletion after a page boundary', async () => {
    await configureRetention({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    await setPageSize(2)
    const sharedKey = `copyright-inbound/${randomUUID()}.pdf`
    const [first, second] = await Promise.all([
      createRetentionEmailCase(),
      createRetentionEmailCase(),
    ])
    for (const entry of [first, second]) {
      const aggregate = await getCopyrightNoticePrivateAggregate(entry.noticeId)
      const submissionId = aggregate?.submissions[0]?.id
      if (!submissionId) throw new Error('Email purge fixture submission is missing')
      await addRetentionArtifact(submissionId, sharedKey)
      await settleCopyrightCasePurgeFixtureActions(entry.noticeId)
      await publishCopyrightCasePurgeCoverage(entry.noticeId)
      for (const key of entry.evidenceKeys) bucket.put(key)
    }
    bucket.put(sharedKey, { versions: 3, deleteMarker: true })
    const originalGeneration = (await readCopyrightCasePurgeFixtureObject(sharedKey))?.generation

    await finishCase(firstPage(first.noticeId))
    expect(bucket.countVersions(sharedKey)).toBe(4)
    expect((await readCopyrightCasePurgeFixtureObject(sharedKey))?.claimed).toBe(false)
    expect((await readCopyrightCasePurgeFixtureObject(sharedKey))?.generation).not.toBe(
      originalGeneration,
    )
    expect(await readCopyrightCasePurgeFixture(second.noticeId)).toMatchObject({
      live: true,
      artifactCount: 2,
    })

    let data = firstPage(second.noticeId)
    for (let page = 0; page < 1_000; page += 1) {
      const result = await runCopyrightCasePurgePage(data, PURGE_NOW)
      if (!result.hasMore) throw new Error('Second case stopped before claiming shared object')
      data = result.data
      if (
        data.phase === 'evidence' &&
        (await readCopyrightCasePurgeFixtureObject(sharedKey))?.claimed
      ) {
        assertClaimPrecedesDelete(bucket.countVersions(sharedKey))
        await finishCase(data)
        await assertSharedObjectDeleted(sharedKey, bucket.countVersions(sharedKey))
        await assertKeyReused(sharedKey)
        return
      }
    }
    throw new Error(`Second case never claimed shared evidence at ${data.phase}`)
  }, 30_000)
})
