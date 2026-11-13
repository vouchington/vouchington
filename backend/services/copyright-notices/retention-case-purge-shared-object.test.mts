import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  addRetentionArtifact,
  createRetentionMinimalCase,
} from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  publishCopyrightCasePurgeCoverage,
  readCopyrightCasePurgeFixture,
  readCopyrightCasePurgeFixtureObject,
  settleCopyrightCasePurgeFixtureActions,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const pageSize = 2

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
    const result = await runCopyrightCasePurgePage(current, PURGE_NOW, pageSize)
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
  const bucket = useCopyrightEvidenceBucket()

  // no-mistakes-timeout-reason: two reviewed email cases and their bounded PostgreSQL and S3 pages
  it('keeps a shared object for its other owner, then resumes a claimed deletion after a page boundary', async () => {
    const sharedKey = `copyright-inbound/${randomUUID()}.pdf`
    const first = await createRetentionMinimalCase({
      artifacts: 1,
      sourceKind: 'email',
      substantiallyCompliant: false,
    })
    const second = await createRetentionMinimalCase({
      artifacts: 1,
      sourceKind: 'email',
      substantiallyCompliant: false,
    })
    for (const entry of [first, second]) {
      await addRetentionArtifact(entry.submissionId, sharedKey)
      await settleCopyrightCasePurgeFixtureActions(entry.noticeId)
      await publishCopyrightCasePurgeCoverage(entry.noticeId)
      for (const key of entry.evidenceKeys) await bucket.put(key)
    }
    await bucket.put(sharedKey, { versions: 3, deleteMarker: true })
    const originalGeneration = (await readCopyrightCasePurgeFixtureObject(sharedKey))?.generation

    await finishCase(firstPage(first.noticeId))
    expect(await bucket.countVersions(sharedKey)).toBe(4)
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
      const result = await runCopyrightCasePurgePage(data, PURGE_NOW, pageSize)
      if (!result.hasMore) throw new Error('Second case stopped before claiming shared object')
      data = result.data
      if (
        data.phase === 'evidence' &&
        (await readCopyrightCasePurgeFixtureObject(sharedKey))?.claimed
      ) {
        assertClaimPrecedesDelete(await bucket.countVersions(sharedKey))
        await finishCase(data)
        await assertSharedObjectDeleted(sharedKey, await bucket.countVersions(sharedKey))
        await assertKeyReused(sharedKey)
        return
      }
    }
    throw new Error(`Second case never claimed shared evidence at ${data.phase}`)
  }, 30_000)
})
